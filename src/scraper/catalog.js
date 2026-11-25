import * as cheerio from 'cheerio';
import { config } from '../config/index.js';
import { defaultScraperClient } from './client.js';
import { parseCardsFromContainer } from './card-parser.js';
import { crawlPaginatedCatalog, extractPaginationInfo } from './pagination.js';

export function parseCatalogPage(html, { baseUrl = config.source.baseUrl, defaultType = 'series', flags = {}, page = 1 } = {}) {
  const $ = typeof html === 'string' ? cheerio.load(html) : html;
  const pagination = extractPaginationInfo($, page);
  if (pagination.isHomepageFallback) {
    return { items: [], pagination };
  }

  // Prefer the main .gallery-grid to avoid capturing sidebar/related cards
  const $grid = $('.gallery-grid').first();
  const container = $grid.length ? $grid : $('main').first();
  const items = parseCardsFromContainer($, container, { baseUrl, defaultType, flags });

  return { items, pagination };
}

export async function scrapeCatalog(
  path,
  {
    baseUrl = config.source.baseUrl,
    defaultType = 'series',
    flags = {},
    startPage = 1,
    maxPages = config.scraper.maxPagesPerRun,
    client = defaultScraperClient,
    onPage,
    shouldStop,
    signal,
  } = {}
) {
  return crawlPaginatedCatalog({
    baseUrl,
    path,
    startPage,
    maxPages,
    client,
    onPage,
    shouldStop,
    signal,
    parsePage: ($, ctx) => parseCatalogPage($, { baseUrl, defaultType, flags, page: ctx.page }).items,
  });
}

/**
 * Fetches dynamic recommendations from POST /ajax/filter-recommendation.
 */
export async function scrapeRecommendationFeed({
  baseUrl = config.source.baseUrl,
  type = 'series',
  genre1 = '',
  genre2 = '',
  country = '',
  years = '',
  artist = '',
  client = defaultScraperClient,
  signal,
} = {}) {
  const url = `${baseUrl}/ajax/filter-recommendation`;
  const { html } = await client.postForm(
    url,
    { type, genre1, genre2, country, years, artist },
    { headers: { Referer: `${baseUrl}/rekomendasi-film-pintar` }, signal }
  );
  const $ = cheerio.load(html);
  const items = parseCardsFromContainer($, $.root(), {
    baseUrl,
    defaultType: type === 'movie' ? 'movie' : 'series',
    flags: { is_recommended: true },
  });
  return { items, sourceUrl: url };
}
