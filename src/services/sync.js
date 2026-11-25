import { config } from '../config/index.js';
import {
  getContentBySlug,
  getPendingDetailContents,
  getSeriesForEpisodeSync,
  upsertContents,
  upsertCountries,
  upsertGenres,
} from '../database/contents.js';
import { upsertEpisodes } from '../database/episodes.js';
import {
  createScraperJob,
  createSyncLog,
  finishSyncLog,
  isCrawlerPaused,
  listScraperJobs,
  updateScraperJob,
} from '../database/jobs.js';
import { upsertSeasons } from '../database/seasons.js';
import { scrapeCatalog } from '../scraper/catalog.js';
import { scrapeDetail } from '../scraper/detail.js';
import { scrapeSeriesSeasonsAndEpisodes } from '../scraper/episodes.js';
import { scrapeHomepage } from '../scraper/homepage.js';
import { MOVIE_CATALOG_PATHS, scrapeLatestMovies } from '../scraper/movies.js';
import {
  SERIES_CATALOG_PATHS,
  scrapeLatestSeries,
  scrapeOngoingSeries,
  scrapePopularSeries,
  scrapeRecommendedSeries,
} from '../scraper/series.js';
import { invalidateNamespaces } from './cache.js';
import { deduplicateContents } from './normalization.js';
import { runBatchQueue } from './queue.js';
import { logger } from '../utils/logger.js';
import { scrapedContentSchema } from '../utils/validator.js';

export const FULL_SYNC_CATEGORIES = [
  { key: 'latest-series', path: SERIES_CATALOG_PATHS.latest, baseUrl: () => config.source.baseUrl, type: 'series', flags: {} },
  { key: 'popular-series', path: SERIES_CATALOG_PATHS.popular, baseUrl: () => config.source.baseUrl, type: 'series', flags: { is_popular: true } },
  { key: 'featured-series', path: SERIES_CATALOG_PATHS.featured, baseUrl: () => config.source.baseUrl, type: 'series', flags: { is_featured: true } },
  { key: 'ongoing-series', path: SERIES_CATALOG_PATHS.ongoing, baseUrl: () => config.source.baseUrl, type: 'series', flags: { status: 'ongoing' } },
  { key: 'completed-series', path: SERIES_CATALOG_PATHS.completed, baseUrl: () => config.source.baseUrl, type: 'series', flags: { status: 'completed' } },
  { key: 'asian-series', path: SERIES_CATALOG_PATHS.asian, baseUrl: () => config.source.baseUrl, type: 'series', flags: { region: 'Asian' } },
  { key: 'western-series', path: SERIES_CATALOG_PATHS.west, baseUrl: () => config.source.baseUrl, type: 'series', flags: { region: 'West' } },
  { key: 'latest-movies', path: MOVIE_CATALOG_PATHS.latest, baseUrl: () => config.source.movieBaseUrl, type: 'movie', flags: {} },
  { key: 'popular-movies', path: MOVIE_CATALOG_PATHS.popular, baseUrl: () => config.source.movieBaseUrl, type: 'movie', flags: { is_popular: true } },
];

function validateScrapedBatch(items) {
  const valid = [];
  let invalidCount = 0;
  for (const item of items) {
    const parsed = scrapedContentSchema.safeParse(item);
    if (parsed.success) {
      valid.push(item);
    } else {
      invalidCount += 1;
      logger.warn({ slug: item?.slug, issues: parsed.error.issues }, 'Skipping invalid scraped record');
    }
  }
  return { valid, invalidCount };
}

export async function runQuickSync({ maxPages = 2, includeMovies = true, signal } = {}) {
  if (await isCrawlerPaused()) {
    return { status: 'paused', message: 'Crawler is currently paused' };
  }

  const syncLog = await createSyncLog('quick_sync', { maxPages, includeMovies });
  const job = await createScraperJob({
    jobType: 'quick_sync',
    targetUrl: config.source.baseUrl,
    metadata: { maxPages, includeMovies },
  });

  const totals = { discovered: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, pages: 0 };
  const collected = [];
  const errors = [];

  try {
    // 1. Homepage + Taxonomy
    const home = await scrapeHomepage({ signal });
    collected.push(...home.allItems);
    totals.pages += 1;

    if (home.taxonomy.genres.length) await upsertGenres(home.taxonomy.genres);
    if (home.taxonomy.countries.length) await upsertCountries(home.taxonomy.countries);

    // 2. Latest series, Popular, Ongoing, Recommendations, and optional Latest Movies
    const feeds = [
      () => scrapeLatestSeries({ maxPages, signal, shouldStop: isCrawlerPaused }),
      () => scrapePopularSeries({ maxPages: 1, signal, shouldStop: isCrawlerPaused }),
      () => scrapeOngoingSeries({ maxPages: 1, signal, shouldStop: isCrawlerPaused }),
      () => scrapeRecommendedSeries({ signal }),
      ...(includeMovies ? [() => scrapeLatestMovies({ maxPages: 1, signal, shouldStop: isCrawlerPaused })] : []),
    ];

    for (const runFeed of feeds) {
      if (signal?.aborted || (await isCrawlerPaused())) break;
      try {
        const res = await runFeed();
        if (Array.isArray(res.items)) collected.push(...res.items);
        totals.pages += res.pagesProcessed || 1;
        if (res.failedPages?.length) {
          totals.failed += res.failedPages.length;
          errors.push(...res.failedPages);
        }
      } catch (err) {
        totals.failed += 1;
        errors.push({ error: err.message, code: err.code });
        logger.error({ err: err.message }, 'Quick sync feed failed (continuing with remaining feeds)');
      }
    }

    const deduped = deduplicateContents(collected);
    const { valid, invalidCount } = validateScrapedBatch(deduped);
    totals.discovered = deduped.length;
    totals.failed += invalidCount;

    if (valid.length > 0) {
      const dbResult = await upsertContents(valid);
      totals.inserted += dbResult.inserted;
      totals.updated += dbResult.updated;
      totals.skipped += dbResult.skipped;
    }

    const finalStatus = totals.failed > 0 && totals.inserted + totals.updated > 0 ? 'partial' : totals.failed > 0 ? 'failed' : 'completed';

    await updateScraperJob(job.id, {
      status: finalStatus === 'failed' ? 'failed' : 'completed',
      pages_processed: totals.pages,
      items_discovered: totals.discovered,
      items_processed: totals.inserted + totals.updated,
      items_failed: totals.failed,
      completed_at: new Date().toISOString(),
      error_message: errors.length ? errors.map((e) => e.error).join('; ').slice(0, 500) : null,
      metadata: { maxPages, includeMovies, errors },
    });

    const log = await finishSyncLog(syncLog.id, {
      status: finalStatus,
      total_discovered: totals.discovered,
      total_inserted: totals.inserted,
      total_updated: totals.updated,
      total_skipped: totals.skipped,
      total_failed: totals.failed,
      metadata: { jobId: job.id, pages: totals.pages },
    });

    await invalidateNamespaces(['home', 'catalog', 'popular', 'recommendations', 'taxonomy', 'search']);

    return { status: finalStatus, jobId: job.id, syncLogId: log.id, totals, errors };
  } catch (err) {
    await updateScraperJob(job.id, {
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: err.message,
    });
    await finishSyncLog(syncLog.id, { status: 'failed', total_failed: totals.failed + 1, metadata: { error: err.message } });
    throw err;
  }
}

export async function runFullCatalogSync({
  category,
  startPage = 1,
  maxPages = config.scraper.maxPagesPerRun,
  includeMovies = true,
  signal,
} = {}) {
  if (await isCrawlerPaused()) {
    return { status: 'paused', message: 'Crawler is currently paused' };
  }

  const targets = category
    ? FULL_SYNC_CATEGORIES.filter((c) => c.key === category)
    : FULL_SYNC_CATEGORIES.filter((c) => includeMovies || c.type !== 'movie');

  if (targets.length === 0) {
    const err = new Error(`Unknown catalog category: ${category}`);
    err.statusCode = 400;
    err.code = 'INVALID_CATEGORY';
    throw err;
  }

  const syncLog = await createSyncLog('full_catalog_sync', { category: category || 'all', startPage, maxPages });
  const totals = { discovered: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, pages: 0 };
  const categorySummaries = [];

  for (const cat of targets) {
    if (signal?.aborted || (await isCrawlerPaused())) break;

    const targetUrl = `${cat.baseUrl()}${cat.path}`;
    const job = await createScraperJob({
      jobType: 'catalog_sync',
      targetUrl,
      metadata: { category: cat.key, startPage, maxPages },
    });

    try {
      const crawl = await scrapeCatalog(cat.path, {
        baseUrl: cat.baseUrl(),
        defaultType: cat.type,
        flags: cat.flags,
        startPage,
        maxPages,
        signal,
        shouldStop: isCrawlerPaused,
        onPage: async ({ items }) => {
          const { valid } = validateScrapedBatch(items);
          if (valid.length > 0) {
            const dbRes = await upsertContents(valid);
            totals.inserted += dbRes.inserted;
            totals.updated += dbRes.updated;
            totals.skipped += dbRes.skipped;
          }
        },
      });

      totals.discovered += crawl.items.length;
      totals.pages += crawl.pagesProcessed;
      totals.failed += crawl.failedPages.length;

      await updateScraperJob(job.id, {
        status: crawl.failedPages.length > 0 && crawl.items.length === 0 ? 'failed' : 'completed',
        pages_processed: crawl.pagesProcessed,
        items_discovered: crawl.items.length,
        items_processed: crawl.items.length,
        items_failed: crawl.failedPages.length,
        completed_at: new Date().toISOString(),
        error_message: crawl.failedPages.length ? `${crawl.failedPages.length} page(s) failed` : null,
        metadata: {
          category: cat.key,
          startPage,
          lastPage: crawl.lastPage,
          nextPage: crawl.nextPage,
          totalPages: crawl.totalPages,
          hasMore: crawl.hasMore,
          failedPages: crawl.failedPages,
        },
      });

      categorySummaries.push({
        category: cat.key,
        jobId: job.id,
        pagesProcessed: crawl.pagesProcessed,
        itemsDiscovered: crawl.items.length,
        nextPage: crawl.nextPage,
        hasMore: crawl.hasMore,
        failedPages: crawl.failedPages.length,
      });
    } catch (err) {
      totals.failed += 1;
      await updateScraperJob(job.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: err.message,
      });
      categorySummaries.push({ category: cat.key, jobId: job.id, error: err.message });
    }
  }

  const finalStatus = totals.failed > 0 && totals.discovered > 0 ? 'partial' : totals.failed > 0 ? 'failed' : 'completed';
  await finishSyncLog(syncLog.id, {
    status: finalStatus,
    total_discovered: totals.discovered,
    total_inserted: totals.inserted,
    total_updated: totals.updated,
    total_skipped: totals.skipped,
    total_failed: totals.failed,
    metadata: { categories: categorySummaries },
  });

  await invalidateNamespaces(['home', 'catalog', 'popular', 'recommendations', 'taxonomy', 'search']);

  return { status: finalStatus, syncLogId: syncLog.id, totals, categories: categorySummaries };
}

export async function syncSingleContentDetail(targetUrl, { signal } = {}) {
  const parsed = await scrapeDetail(targetUrl, { signal });
  const check = scrapedContentSchema.safeParse(parsed.content);
  if (!check.success) {
    throw new Error(`Invalid detail payload for ${targetUrl}: ${check.error.issues[0]?.message}`);
  }

  const upsertRes = await upsertContents([parsed.content]);
  const saved = upsertRes.records[0];

  let seasonsCount = 0;
  let episodesCount = 0;
  if (saved && parsed.seasons.length > 0) {
    const savedSeasons = await upsertSeasons(saved.id, parsed.seasons);
    seasonsCount = savedSeasons.length;
    if (parsed.episodes.length > 0) {
      const savedEpisodes = await upsertEpisodes(saved.id, savedSeasons, parsed.episodes);
      episodesCount = savedEpisodes.length;
    }
  }

  // Non-destructively enqueue related cards discovered on the detail page
  if (parsed.related.length > 0) {
    const { valid } = validateScrapedBatch(parsed.related);
    if (valid.length > 0) await upsertContents(valid);
  }

  return {
    content: saved,
    inserted: upsertRes.inserted,
    updated: upsertRes.updated,
    seasonsCount,
    episodesCount,
  };
}

export async function runDetailSync({ batchSize = config.scraper.detailBatchSize, slugs = [], signal } = {}) {
  if (await isCrawlerPaused()) {
    return { status: 'paused', message: 'Crawler is currently paused' };
  }

  let targets = [];
  if (Array.isArray(slugs) && slugs.length > 0) {
    for (const slug of slugs) {
      const row = await getContentBySlug(slug);
      if (row?.detail_source_url) targets.push(row);
    }
  } else {
    targets = await getPendingDetailContents(batchSize);
  }

  const syncLog = await createSyncLog('detail_sync', { batchSize, targetCount: targets.length });
  const job = await createScraperJob({
    jobType: 'detail_sync',
    targetUrl: targets[0]?.detail_source_url || config.source.baseUrl,
    metadata: { batchSize, targetCount: targets.length },
  });

  const totals = { discovered: targets.length, inserted: 0, updated: 0, skipped: 0, failed: 0 };

  const queueResult = await runBatchQueue(
    targets,
    async (item) => {
      const res = await syncSingleContentDetail(item.detail_source_url, { signal });
      totals.inserted += res.inserted;
      totals.updated += res.updated;
      return res;
    },
    {
      concurrency: config.scraper.concurrency,
      shouldStop: isCrawlerPaused,
      signal,
      onError: async (item, err) => {
        totals.failed += 1;
        await createScraperJob({
          jobType: 'detail_item',
          targetUrl: item.detail_source_url,
          metadata: { slug: item.slug, contentType: item.content_type },
        })
          .then((failedJob) =>
            updateScraperJob(failedJob.id, {
              status: 'failed',
              items_failed: 1,
              completed_at: new Date().toISOString(),
              error_message: err.message,
            })
          )
          .catch(() => {});
      },
    }
  );

  const finalStatus = totals.failed > 0 && queueResult.processed > 0 ? 'partial' : totals.failed > 0 ? 'failed' : 'completed';

  await updateScraperJob(job.id, {
    status: finalStatus === 'failed' ? 'failed' : 'completed',
    items_discovered: targets.length,
    items_processed: queueResult.processed,
    items_failed: totals.failed,
    completed_at: new Date().toISOString(),
    error_message: queueResult.errors.length ? queueResult.errors[0].error : null,
  });

  await finishSyncLog(syncLog.id, {
    status: finalStatus,
    total_discovered: totals.discovered,
    total_inserted: totals.inserted,
    total_updated: totals.updated,
    total_skipped: totals.skipped,
    total_failed: totals.failed,
  });

  await invalidateNamespaces(['detail', 'episodes', 'home', 'catalog', 'search']);

  return { status: finalStatus, jobId: job.id, syncLogId: syncLog.id, totals, errors: queueResult.errors };
}

export async function runEpisodeSync({ batchSize = config.scraper.detailBatchSize, enrichEpisodes = false, signal } = {}) {
  if (await isCrawlerPaused()) {
    return { status: 'paused', message: 'Crawler is currently paused' };
  }

  const targets = await getSeriesForEpisodeSync(batchSize);
  const syncLog = await createSyncLog('episode_sync', { batchSize, targetCount: targets.length, enrichEpisodes });
  const job = await createScraperJob({
    jobType: 'episode_sync',
    targetUrl: targets[0]?.detail_source_url || config.source.baseUrl,
    metadata: { batchSize, targetCount: targets.length },
  });

  let seasonsSynced = 0;
  let episodesSynced = 0;
  let failed = 0;

  const queueResult = await runBatchQueue(
    targets,
    async (series) => {
      const { seasons, episodes } = await scrapeSeriesSeasonsAndEpisodes(series.detail_source_url, {
        enrichEpisodes,
        signal,
      });
      if (seasons.length > 0) {
        const savedSeasons = await upsertSeasons(series.id, seasons);
        seasonsSynced += savedSeasons.length;
        if (episodes.length > 0) {
          const savedEps = await upsertEpisodes(series.id, savedSeasons, episodes);
          episodesSynced += savedEps.length;
        }
      }
      return { seasons: seasons.length, episodes: episodes.length };
    },
    {
      concurrency: config.scraper.concurrency,
      shouldStop: isCrawlerPaused,
      signal,
      onError: () => {
        failed += 1;
      },
    }
  );

  const finalStatus = failed > 0 && queueResult.processed > 0 ? 'partial' : failed > 0 ? 'failed' : 'completed';

  await updateScraperJob(job.id, {
    status: finalStatus === 'failed' ? 'failed' : 'completed',
    items_discovered: targets.length,
    items_processed: queueResult.processed,
    items_failed: failed,
    completed_at: new Date().toISOString(),
    metadata: { seasonsSynced, episodesSynced },
  });

  await finishSyncLog(syncLog.id, {
    status: finalStatus,
    total_discovered: targets.length,
    total_updated: queueResult.processed,
    total_failed: failed,
    metadata: { seasonsSynced, episodesSynced },
  });

  await invalidateNamespaces(['episodes', 'detail']);

  return {
    status: finalStatus,
    jobId: job.id,
    syncLogId: syncLog.id,
    seriesProcessed: queueResult.processed,
    seasonsSynced,
    episodesSynced,
    failed,
  };
}

export async function retryFailedJobs({ limit = 10, signal } = {}) {
  const failedJobs = await listScraperJobs({ status: 'failed', limit });
  const retried = [];

  for (const job of failedJobs) {
    if (signal?.aborted || (await isCrawlerPaused())) break;
    try {
      if (job.job_type === 'detail_item') {
        await syncSingleContentDetail(job.target_url, { signal });
      } else if (job.job_type === 'catalog_sync' && job.metadata?.category) {
        await runFullCatalogSync({
          category: job.metadata.category,
          startPage: job.metadata.nextPage || job.metadata.startPage || 1,
          maxPages: job.metadata.maxPages || 2,
          signal,
        });
      } else if (job.job_type === 'quick_sync') {
        await runQuickSync({ maxPages: 1, signal });
      } else {
        continue;
      }

      await updateScraperJob(job.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        error_message: null,
        metadata: { ...(job.metadata || {}), retried_at: new Date().toISOString() },
      });
      retried.push({ id: job.id, jobType: job.job_type, status: 'completed' });
    } catch (err) {
      await updateScraperJob(job.id, {
        status: 'failed',
        error_message: err.message,
        metadata: {
          ...(job.metadata || {}),
          last_retry_at: new Date().toISOString(),
          retry_count: (job.metadata?.retry_count || 0) + 1,
        },
      });
      retried.push({ id: job.id, jobType: job.job_type, status: 'failed', error: err.message });
    }
  }

  return { attempted: retried.length, results: retried };
}
