import * as cheerio from 'cheerio';
import { config } from '../config/index.js';
import { defaultScraperClient } from './client.js';
import { parseCardsFromContainer } from './card-parser.js';
import { parseSeasonsAndEpisodes } from './episodes.js';
import {
  cleanText,
  extractSlugFromUrl,
  normalizeContentRecord,
  normalizeDate,
  normalizeRating,
  normalizeStatus,
  normalizeStringList,
  normalizeTimestamp,
  normalizeTitle,
  normalizeYear,
  resolveUrl,
} from '../services/normalization.js';

function safeJsonParse(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw.trim());
  } catch {
    return null;
  }
}

function findPrimaryJsonLd($) {
  let matched = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    const parsed = safeJsonParse($(el).text());
    if (!parsed) return;
    if (parsed['@type'] === 'TVSeries' || parsed['@type'] === 'Movie' || parsed['@type'] === 'TVEpisode') {
      matched = parsed;
    }
  });
  return matched;
}

function parseDetailPairs($) {
  const fields = {};
  $('.detail p').each((_, p) => {
    const $p = $(p);
    const labelRaw = cleanText($p.find('span').first().text());
    if (!labelRaw) return;
    const key = labelRaw.replace(/[:\s]+$/g, '').toLowerCase();
    const links = $p
      .find('a')
      .map((__, a) => cleanText($(a).text()))
      .get()
      .filter(Boolean);

    const clone = $p.clone();
    clone.find('span').first().remove();
    const valueText = cleanText(clone.text());
    fields[key] = { text: valueText, links };
  });
  return fields;
}

export function parseDetailPage(html, sourceUrl) {
  const $ = cheerio.load(html);
  const origin = (() => {
    try {
      return new URL(sourceUrl).origin;
    } catch {
      return config.source.baseUrl;
    }
  })();

  const watchData = safeJsonParse($('script#watch-history-data').text());
  const jsonLd = findPrimaryJsonLd($);
  const h1Text = cleanText($('.movie-info h1, h1').first().text());

  if (!watchData && !jsonLd && !h1Text) {
    const err = new Error(`Unrecognized detail page structure at ${sourceUrl}`);
    err.code = 'PARSE_ERROR';
    throw err;
  }

  const hasSeasonData = $('script#season-data').length > 0;
  const isSeries =
    hasSeasonData ||
    jsonLd?.['@type'] === 'TVSeries' ||
    jsonLd?.['@type'] === 'TVEpisode' ||
    watchData?.total_season !== undefined ||
    watchData?.total_eps !== undefined;
  const contentType = isSeries ? 'series' : 'movie';

  const slug = watchData?.slug || extractSlugFromUrl(sourceUrl);
  const title = normalizeTitle(watchData?.title || h1Text) || slug;

  // Parse .info-tag spans (Series: [date, region, status]; Movie: [age, quality, resolution, duration])
  const infoTags = $('.movie-info .info-tag span')
    .map((_, s) => cleanText($(s).text()))
    .get()
    .filter(Boolean);

  let tagReleaseDate = null;
  let region = null;
  let status = contentType === 'movie' ? 'released' : null;
  let quality = null;
  let duration = watchData?.runtime || null;

  for (const tag of infoTags) {
    const lower = tag.toLowerCase();
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(tag)) {
      tagReleaseDate = normalizeDate(tag);
    } else if (lower === 'ongoing' || lower === 'complete' || lower === 'completed') {
      status = normalizeStatus(tag, contentType);
    } else if (lower === 'asian' || lower === 'west' || lower === 'western') {
      region = lower === 'asian' ? 'Asian' : 'West';
    } else if (/^(webdl|hd|cam|hdrip|bluray|dvdrip|hdts|ts|4k|1080p|720p|480p)/i.test(tag)) {
      quality = quality ? `${quality} ${tag}` : tag;
    } else if (/^\d+h\s*\d*m?$|^\d{1,2}:\d{2}$|^\d+\s*min/i.test(tag)) {
      duration = tag;
    }
  }

  // Parse .tag-list countries and genres
  const tagGenres = [];
  const tagCountries = [];
  $('.tag-list .tag a').each((_, a) => {
    const href = $(a).attr('href') || '';
    const text = cleanText($(a).text());
    if (!text) return;
    if (href.includes('/genre/')) tagGenres.push(text);
    else if (href.includes('/country/')) tagCountries.push(text);
  });

  // Parse .detail key-value rows
  const detailPairs = parseDetailPairs($);

  const directors = detailPairs.sutradara?.links?.length
    ? detailPairs.sutradara.links
    : detailPairs.sutradara?.text
      ? detailPairs.sutradara.text.split(',')
      : Array.isArray(jsonLd?.director)
        ? jsonLd.director.map((d) => d?.name).filter(Boolean)
        : [];

  const cast = detailPairs['bintang film']?.links?.length
    ? detailPairs['bintang film'].links
    : detailPairs['bintang film']?.text
      ? detailPairs['bintang film'].text.split(',')
      : Array.isArray(jsonLd?.actor)
        ? jsonLd.actor.map((a) => a?.name).filter(Boolean)
        : [];

  const countries = tagCountries.length
    ? tagCountries
    : detailPairs.negara?.links?.length
      ? detailPairs.negara.links
      : detailPairs.negara?.text
        ? [detailPairs.negara.text]
        : [];

  const genres = normalizeStringList([
    ...tagGenres,
    ...(Array.isArray(jsonLd?.genre) ? jsonLd.genre : jsonLd?.genre ? [jsonLd.genre] : []),
  ]);

  const synopsis = cleanText($('.meta-info .synopsis, .synopsis').first().text());

  const posterUrl = resolveUrl(
    watchData?.poster ||
      jsonLd?.image ||
      $('meta[property="og:image"]').attr('content') ||
      $('.detail picture img').first().attr('data-src') ||
      $('.detail picture img').first().attr('src'),
    origin
  );

  const releaseDate =
    normalizeDate(jsonLd?.datePublished) ||
    normalizeDate(detailPairs.release?.text) ||
    tagReleaseDate;

  const releaseYear =
    normalizeYear(watchData?.year) ||
    normalizeYear(releaseDate) ||
    normalizeYear(h1Text);

  const sourceUpdatedAt = normalizeTimestamp(detailPairs.updated?.text);

  // Extract related cards
  let related = [];
  $('.widget, section').each((_, sec) => {
    const heading = (cleanText($(sec).find('h2').first().text()) || '').toLowerCase();
    if (heading.includes('terkait')) {
      related = parseCardsFromContainer($, sec, { baseUrl: origin, defaultType: contentType });
    }
  });

  // Extract seasons & episodes for series
  const { seasons, episodes } = isSeries
    ? parseSeasonsAndEpisodes($, origin, posterUrl)
    : { seasons: [], episodes: [] };

  const totalSeasons =
    seasons.length > 0
      ? seasons.length
      : Number.isFinite(Number(watchData?.total_season))
        ? Number(watchData.total_season)
        : null;

  const totalEpisodes =
    episodes.length > 0
      ? episodes.length
      : Number.isFinite(Number(watchData?.total_eps))
        ? Number(watchData.total_eps)
        : null;

  const content = normalizeContentRecord({
    source_id: watchData?.id != null ? String(watchData.id) : null,
    source_slug: slug,
    slug,
    title,
    original_title: null, // Source does not provide a separate original title field
    alternative_titles: [],
    content_type: contentType,
    poster_url: posterUrl,
    backdrop_url: null, // Source does not provide a separate backdrop image
    synopsis,
    release_year: releaseYear,
    release_date: releaseDate,
    rating: normalizeRating(watchData?.rating),
    duration,
    quality,
    status,
    region,
    country: countries[0] || null,
    director: normalizeStringList(directors).join(', ') || null,
    cast: normalizeStringList(cast),
    genres,
    related_slugs: related.map((r) => r.slug).filter(Boolean),
    total_seasons: totalSeasons,
    total_episodes: totalEpisodes,
    detail_source_url: sourceUrl,
    source_updated_at: sourceUpdatedAt,
    detail_scraped_at: new Date().toISOString(),
  });

  return { content, seasons, episodes, related };
}

export async function scrapeDetail(url, { client = defaultScraperClient, signal } = {}) {
  const { html, finalUrl } = await client.fetchHtml(url, { signal });
  return parseDetailPage(html, finalUrl);
}
