import * as cheerio from 'cheerio';
import { config } from '../config/index.js';
import { defaultScraperClient } from './client.js';
import { cleanText, extractSlugFromUrl, normalizeDate, resolveUrl } from '../services/normalization.js';

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

/**
 * Extracts all seasons and episodes from a series detail page's embedded
 * `<script id="season-data" type="application/json">` payload.
 */
export function parseSeasonsAndEpisodes(htmlOrDoc, baseUrl = config.source.baseUrl, fallbackThumbnail = null) {
  const $ = typeof htmlOrDoc === 'string' ? cheerio.load(htmlOrDoc) : htmlOrDoc;
  const raw = $('script#season-data').text();
  const data = safeJsonParse(raw);

  if (!data || typeof data !== 'object') {
    return { seasons: [], episodes: [] };
  }

  const seasons = [];
  const episodes = [];
  const seasonKeys = Object.keys(data).sort((a, b) => Number(a) - Number(b));

  for (const key of seasonKeys) {
    const list = Array.isArray(data[key]) ? data[key] : [];
    const seasonNumber = Number.parseInt(key, 10);
    if (!Number.isFinite(seasonNumber)) continue;

    seasons.push({
      season_number: seasonNumber,
      season_title: `Season ${seasonNumber}`,
      description: null,
      episode_count: list.length,
    });

    for (const item of list) {
      const epNumber = Number.parseInt(item?.episode_no, 10);
      const epSlug = cleanText(item?.slug);
      if (!Number.isFinite(epNumber) || !epSlug) continue;
      const sourceUrl = resolveUrl(`/${epSlug.replace(/^\/+/, '')}`, baseUrl);
      if (!sourceUrl) continue;

      episodes.push({
        season_number: Number.isFinite(Number(item?.s)) ? Number(item.s) : seasonNumber,
        episode_number: epNumber,
        episode_title: cleanText(item?.title) || `Season ${seasonNumber} Episode ${epNumber}`,
        episode_slug: epSlug.replace(/^\/+/, ''),
        thumbnail_url: fallbackThumbnail || null,
        description: null,
        release_date: null,
        source_url: sourceUrl,
      });
    }
  }

  return { seasons, episodes };
}

/**
 * Parses an individual episode detail page for release date, thumbnail,
 * and description metadata (strictly excluding video/stream embeds).
 */
export function parseEpisodeDetailPage(html, sourceUrl) {
  const $ = cheerio.load(html);
  const origin = (() => {
    try {
      return new URL(sourceUrl).origin;
    } catch {
      return config.source.baseUrl;
    }
  })();

  let tvEpisodeLd = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    const parsed = safeJsonParse($(el).text());
    if (parsed?.['@type'] === 'TVEpisode') tvEpisodeLd = parsed;
  });

  const watchData = safeJsonParse($('script#watch-history-data').text());
  const h1 = cleanText($('.movie-info h1, h1').first().text());
  const epSlug = extractSlugFromUrl(sourceUrl);

  return {
    season_number: Number(tvEpisodeLd?.seasonNumber ?? watchData?.current_season ?? 1),
    episode_number: Number(tvEpisodeLd?.episodeNumber ?? watchData?.current_eps ?? 1),
    episode_title: h1 || cleanText(tvEpisodeLd?.name) || epSlug,
    episode_slug: epSlug,
    thumbnail_url: resolveUrl(
      tvEpisodeLd?.image || $('meta[property="og:image"]').attr('content') || watchData?.poster,
      origin
    ),
    description: cleanText($('.meta-info .synopsis, .synopsis').first().text()),
    release_date: normalizeDate(tvEpisodeLd?.datePublished),
    source_url: sourceUrl,
  };
}

export async function scrapeSeriesSeasonsAndEpisodes(
  seriesUrl,
  { client = defaultScraperClient, enrichEpisodes = false, maxEnrich = 5, signal } = {}
) {
  const { html, finalUrl } = await client.fetchHtml(seriesUrl, { signal });
  const origin = new URL(finalUrl).origin;
  const $ = cheerio.load(html);
  const fallbackPoster = resolveUrl($('meta[property="og:image"]').attr('content'), origin);
  const { seasons, episodes } = parseSeasonsAndEpisodes($, origin, fallbackPoster);

  if (enrichEpisodes && maxEnrich > 0 && episodes.length > 0) {
    const toEnrich = episodes.slice(-maxEnrich);
    for (const ep of toEnrich) {
      if (signal?.aborted) break;
      try {
        const res = await client.fetchHtml(ep.source_url, { signal });
        const detail = parseEpisodeDetailPage(res.html, res.finalUrl);
        if (detail.release_date) ep.release_date = detail.release_date;
        if (detail.thumbnail_url) ep.thumbnail_url = detail.thumbnail_url;
        if (detail.description) ep.description = detail.description;
      } catch {
        // Non-fatal: keep base metadata from season-data
      }
    }
  }

  return { seasons, episodes };
}
