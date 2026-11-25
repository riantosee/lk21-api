import { config } from '../config/index.js';
import { defaultScraperClient } from './client.js';
import {
  cleanText,
  normalizeContentRecord,
  normalizeRating,
  normalizeYear,
  resolveUrl,
} from '../services/normalization.js';

export function parseSearchApiPayload(payload, { baseUrl = config.source.baseUrl, movieBaseUrl = config.source.movieBaseUrl, thumbnailBaseUrl = config.source.thumbnailBaseUrl } = {}) {
  const rawItems = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.items)
      ? payload.items
      : [];

  const totalPages = Math.max(1, Number(payload?.totalPages ?? payload?.total_pages ?? 1) || 1);

  const items = rawItems
    .map((entry) => {
      const slug = cleanText(entry?.slug)?.replace(/^\/+/, '');
      if (!slug) return null;
      const contentType = entry?.type === 'movie' ? 'movie' : 'series';
      const origin = contentType === 'movie' ? movieBaseUrl : baseUrl;
      const detailUrl = resolveUrl(`/${slug}`, origin);
      const posterUrl = entry?.poster ? resolveUrl(entry.poster, thumbnailBaseUrl) : null;

      return normalizeContentRecord({
        source_id: entry?.id ? String(entry.id) : null,
        source_slug: slug,
        slug,
        title: entry?.title || slug,
        content_type: contentType,
        poster_url: posterUrl,
        release_year: normalizeYear(entry?.year),
        rating: normalizeRating(entry?.rating),
        quality: cleanText(entry?.quality),
        duration: cleanText(entry?.runtime),
        status:
          contentType === 'movie'
            ? 'released'
            : Number(entry?.is_complete) === 1
              ? 'completed'
              : 'ongoing',
        total_seasons: Number.isFinite(Number(entry?.season)) && Number(entry.season) > 0 ? Number(entry.season) : null,
        total_episodes: Number.isFinite(Number(entry?.episode)) && Number(entry.episode) > 0 ? Number(entry.episode) : null,
        detail_source_url: detailUrl,
      });
    })
    .filter(Boolean);

  return { items, totalPages };
}

export async function scrapeSourceSearch(
  query,
  {
    page = 1,
    searchApiBaseUrl = config.source.searchApiBaseUrl,
    baseUrl = config.source.baseUrl,
    movieBaseUrl = config.source.movieBaseUrl,
    thumbnailBaseUrl = config.source.thumbnailBaseUrl,
    client = defaultScraperClient,
    signal,
  } = {}
) {
  const q = cleanText(query);
  if (!q) return { items: [], totalPages: 0, page: 1 };

  const url = `${searchApiBaseUrl}/search.php?s=${encodeURIComponent(q)}&page=${encodeURIComponent(page)}`;
  const { data } = await client.fetchJson(url, {
    headers: { Referer: `${baseUrl}/` },
    signal,
  });
  const parsed = parseSearchApiPayload(data, { baseUrl, movieBaseUrl, thumbnailBaseUrl });
  return { ...parsed, page: Number(page) || 1, sourceUrl: url };
}
