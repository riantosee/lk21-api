import * as cheerio from 'cheerio';
import { config } from '../config/index.js';
import { defaultScraperClient } from './client.js';
import { deduplicateContents } from '../services/normalization.js';
import { logger } from '../utils/logger.js';

export function buildCatalogPageUrl(baseUrl, path, page = 1) {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanPath = `/${String(path || '').replace(/^\/+|\/+$/g, '')}`;
  const normalizedPath = cleanPath === '/' ? '' : cleanPath;
  if (page <= 1) return `${cleanBase}${normalizedPath}`;
  return `${cleanBase}${normalizedPath}/page/${page}`;
}

export function extractPaginationInfo(html, currentPage = 1) {
  const $ = typeof html === 'string' ? cheerio.load(html) : html;
  const pageNumbers = new Set();

  $('.pagination a, nav.pagination a, .pagination-wrapper a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/\/page\/(\d+)\/?$/);
    if (match) pageNumbers.add(Number.parseInt(match[1], 10));
    const numText = Number.parseInt($(el).text().trim(), 10);
    if (Number.isFinite(numText)) pageNumbers.add(numText);
  });

  // Detect out-of-bounds homepage fallback observed on NontonDrama (page > max returns HTTP 200 homepage)
  const isHomepageFallback =
    currentPage > 1 && ($('section.featured').length > 0 || ($('.gallery-grid').length === 0 && pageNumbers.size === 0));

  const maxDiscovered = pageNumbers.size > 0 ? Math.max(...pageNumbers) : currentPage;
  const hasPagination = pageNumbers.size > 0;

  return {
    currentPage,
    totalPages: isHomepageFallback ? Math.max(1, currentPage - 1) : maxDiscovered,
    hasNextPage: !isHomepageFallback && hasPagination && currentPage < maxDiscovered,
    isHomepageFallback,
  };
}

/**
 * Paginated crawler supporting auto page discovery, manual page caps,
 * resume via startPage, duplicate URL tracking, and page failure recovery.
 */
export async function crawlPaginatedCatalog({
  baseUrl = config.source.baseUrl,
  path,
  parsePage,
  startPage = 1,
  maxPages = config.scraper.maxPagesPerRun,
  client = defaultScraperClient,
  onPage,
  shouldStop,
  signal,
}) {
  const seenPageUrls = new Set();
  const seenContentUrls = new Set();
  const collected = [];
  const failedPages = [];

  let currentPage = Math.max(1, startPage);
  let pagesProcessed = 0;
  let totalPages = null;
  let reachedEnd = false;

  while (pagesProcessed < maxPages) {
    if (signal?.aborted || (shouldStop && (await shouldStop()))) {
      logger.info({ path, currentPage }, 'Pagination halted by stop signal or pause state');
      break;
    }

    const pageUrl = buildCatalogPageUrl(baseUrl, path, currentPage);
    if (seenPageUrls.has(pageUrl)) break;
    seenPageUrls.add(pageUrl);

    try {
      const { html, finalUrl } = await client.fetchHtml(pageUrl, { signal });
      const $ = cheerio.load(html);
      const pag = extractPaginationInfo($, currentPage);

      if (pag.isHomepageFallback) {
        logger.info({ path, page: currentPage }, 'Detected homepage fallback past final page; stopping');
        reachedEnd = true;
        break;
      }

      if (pag.totalPages > 0) {
        totalPages = Math.max(totalPages || 0, pag.totalPages);
      }

      const pageItems = parsePage($, { pageUrl: finalUrl, page: currentPage });
      const uniqueNew = [];
      for (const item of pageItems) {
        if (!item?.detail_source_url || seenContentUrls.has(item.detail_source_url)) continue;
        seenContentUrls.add(item.detail_source_url);
        uniqueNew.push(item);
        collected.push(item);
      }

      pagesProcessed += 1;

      if (onPage) {
        await onPage({ page: currentPage, pageUrl: finalUrl, items: uniqueNew, totalPages });
      }

      if (pageItems.length === 0 || !pag.hasNextPage || (totalPages && currentPage >= totalPages)) {
        reachedEnd = true;
        break;
      }

      currentPage += 1;
    } catch (err) {
      logger.error({ path, page: currentPage, pageUrl, err: err.message, code: err.code }, 'Catalog page scrape failed');
      failedPages.push({ page: currentPage, url: pageUrl, error: err.message, code: err.code || 'SCRAPE_ERROR' });
      if (err.code === 'ACCESS_PROTECTED' || err.code === 'ABORTED') break;
      currentPage += 1;
      pagesProcessed += 1;
    }
  }

  return {
    items: deduplicateContents(collected),
    pagesProcessed,
    totalPages: totalPages ?? currentPage,
    lastPage: currentPage,
    nextPage: reachedEnd ? null : currentPage + 1,
    hasMore: !reachedEnd && (totalPages === null || currentPage < totalPages),
    failedPages,
  };
}
