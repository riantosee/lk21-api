import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setDbClient } from '../src/database/client.js';
import { setCrawlerPaused } from '../src/database/jobs.js';
import { setCacheClient } from '../src/services/cache.js';
import { createMockRedis, createMockSupabase } from './helpers/mock-stores.js';

vi.mock('../src/scraper/homepage.js', () => ({
  scrapeHomepage: vi.fn(async () => ({
    sourceUrl: 'https://tv1.nontondrama.vip/',
    taxonomy: {
      genres: [{ name: 'Drama', slug: 'drama', source_url: 'https://tv1.nontondrama.vip/genre/drama' }],
      countries: [{ name: 'South Korea', slug: 'south-korea', source_url: 'https://tv1.nontondrama.vip/country/south-korea' }],
      years: [{ year: 2026, source_url: 'https://tv1.nontondrama.vip/year/2026' }],
    },
    allItems: [
      {
        source_id: null,
        source_slug: 'remarried-empress-2026',
        slug: 'remarried-empress-2026',
        title: 'The Remarried Empress',
        content_type: 'series',
        release_year: 2026,
        rating: 9.5,
        status: 'ongoing',
        genres: ['Drama'],
        cast: [],
        alternative_titles: [],
        related_slugs: [],
        is_featured: true,
        detail_source_url: 'https://tv1.nontondrama.vip/remarried-empress-2026',
      },
    ],
  })),
}));

vi.mock('../src/scraper/series.js', () => ({
  SERIES_CATALOG_PATHS: {
    latest: '/latest-series',
    popular: '/populer',
    featured: '/top-series-today',
    ongoing: '/series/ongoing',
    completed: '/series/complete',
    asian: '/series/asian',
    west: '/series/west',
  },
  scrapeLatestSeries: vi.fn(async () => ({ items: [], pagesProcessed: 1, failedPages: [] })),
  scrapePopularSeries: vi.fn(async () => ({ items: [], pagesProcessed: 1, failedPages: [] })),
  scrapeOngoingSeries: vi.fn(async () => ({ items: [], pagesProcessed: 1, failedPages: [] })),
  scrapeRecommendedSeries: vi.fn(async () => ({ items: [] })),
}));

vi.mock('../src/scraper/movies.js', () => ({
  MOVIE_CATALOG_PATHS: { latest: '/latest', popular: '/populer' },
  scrapeLatestMovies: vi.fn(async () => ({ items: [], pagesProcessed: 1, failedPages: [] })),
}));

vi.mock('../src/scraper/detail.js', () => ({
  scrapeDetail: vi.fn(async (url) => ({
    content: {
      source_id: '35115',
      source_slug: 'remarried-empress-2026',
      slug: 'remarried-empress-2026',
      title: 'The Remarried Empress',
      content_type: 'series',
      synopsis: 'Enriched synopsis from detail page',
      release_year: 2026,
      release_date: '2026-11-03',
      rating: 9.5,
      status: 'ongoing',
      country: 'South Korea',
      director: 'Jo Soo-won',
      cast: ['Shin Min-a'],
      genres: ['Drama', 'Fantasy'],
      alternative_titles: [],
      related_slugs: [],
      total_seasons: 1,
      total_episodes: 1,
      detail_source_url: url,
      detail_scraped_at: new Date().toISOString(),
    },
    seasons: [{ season_number: 1, season_title: 'Season 1', episode_count: 1 }],
    episodes: [
      {
        season_number: 1,
        episode_number: 1,
        episode_title: 'Episode 1',
        episode_slug: 'remarried-empress-season-1-episode-1-2026',
        source_url: 'https://tv1.nontondrama.vip/remarried-empress-season-1-episode-1-2026',
      },
    ],
    related: [],
  })),
}));

import { runDetailSync, runQuickSync } from '../src/services/sync.js';

describe('Automated Synchronization Services', () => {
  let mockDb;
  let mockRedis;

  beforeEach(() => {
    mockDb = createMockSupabase();
    mockRedis = createMockRedis();
    setDbClient(mockDb);
    setCacheClient(mockRedis);
  });

  it('runs quick sync, populates DB, logs job/sync history, and invalidates caches', async () => {
    const res = await runQuickSync({ maxPages: 1 });
    expect(res.status).toBe('completed');
    expect(res.totals.inserted).toBe(1);
    expect(mockDb.tables.contents).toHaveLength(1);
    expect(mockDb.tables.genres).toHaveLength(1);
    expect(mockDb.tables.countries).toHaveLength(1);
    expect(mockDb.tables.scraper_jobs).toHaveLength(1);
    expect(mockDb.tables.sync_logs).toHaveLength(1);
    expect(mockRedis.store.get('nd:v:home')).toBe(1);
  });

  it('runs detail sync to enrich queued contents along with seasons and episodes', async () => {
    await runQuickSync({ maxPages: 1 });
    const detRes = await runDetailSync({ batchSize: 5 });
    expect(detRes.status).toBe('completed');
    expect(detRes.totals.updated).toBe(1);
    expect(mockDb.tables.contents[0].synopsis).toBe('Enriched synopsis from detail page');
    expect(mockDb.tables.seasons).toHaveLength(1);
    expect(mockDb.tables.episodes).toHaveLength(1);
  });

  it('honors crawler pause state without scraping', async () => {
    await setCrawlerPaused(true, 'test');
    const res = await runQuickSync({ maxPages: 1 });
    expect(res.status).toBe('paused');
    expect(mockDb.tables.contents).toHaveLength(0);
  });
});
