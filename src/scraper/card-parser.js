import { config } from '../config/index.js';
import {
  cleanText,
  extractSlugFromUrl,
  normalizeContentRecord,
  normalizeRating,
  normalizeStringList,
  normalizeYear,
  resolveUrl,
} from '../services/normalization.js';

function normalizeMovieUrl(url) {
  if (!url) return null;
  // Homepage LK21 cards link via landing page d21.team/<slug> -> map to configured movie portal
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'd21.team' || parsed.hostname === 'www.d21.team') {
      return `${config.source.movieBaseUrl}${parsed.pathname}`;
    }
    return url;
  } catch {
    return url;
  }
}

export function parseCard($, articleEl, { baseUrl = config.source.baseUrl, defaultType = 'series', flags = {} } = {}) {
  const $el = $(articleEl);
  const $link = $el.find('a[itemprop="url"]').first().length
    ? $el.find('a[itemprop="url"]').first()
    : $el.find('figure a, a').first();

  const rawHref = $link.attr('href');
  let detailUrl = resolveUrl(rawHref, baseUrl);
  if (!detailUrl) return null;

  const $epBadge = $el.find('span.episode').first();
  const $labelBadge = $el.find('span.label').first();
  const $duration = $el.find('span.duration').first();
  const durationText = cleanText($duration.text());

  // Determine content type from card badges and link host
  let contentType = defaultType;
  const isD21Link = /\/\/(www\.)?d21\.team\//i.test(detailUrl) || detailUrl.startsWith(config.source.movieBaseUrl);
  if ($epBadge.length > 0 || (durationText && /^S\.\d+/i.test(durationText))) {
    contentType = 'series';
  } else if ($labelBadge.length > 0 || (durationText && /^\d{1,2}:\d{2}$/.test(durationText)) || isD21Link) {
    contentType = 'movie';
  }

  if (contentType === 'movie') {
    detailUrl = normalizeMovieUrl(detailUrl);
  }

  const slug = extractSlugFromUrl(detailUrl);
  if (!slug) return null;

  const title =
    cleanText($el.find('h3.poster-title, .poster-title').first().text()) ||
    cleanText($el.find('img').first().attr('alt'));
  if (!title) return null;

  const $img = $el.find('picture img, img').first();
  const rawPoster =
    $img.attr('data-src') ||
    $img.attr('src') ||
    $el.find('picture source[type="image/jpeg"]').first().attr('data-srcset') ||
    $el.find('picture source[type="image/jpeg"]').first().attr('srcset') ||
    null;
  const posterUrl = rawPoster && !rawPoster.startsWith('data:') ? resolveUrl(rawPoster, baseUrl) : null;

  const ratingText =
    cleanText($el.find('span.rating [itemprop="ratingValue"]').first().text()) ||
    cleanText($el.find('span.rating').first().text());
  const yearText = cleanText($el.find('span.year').first().text());
  const metaGenres = $el.find('meta[itemprop="genre"]').attr('content');
  const captionGenres = cleanText($el.find('figcaption .genre').text());
  const genres = normalizeStringList(metaGenres || captionGenres);

  let status = null;
  let totalSeasons = null;
  let totalEpisodes = null;
  let duration = null;
  let quality = null;

  if (contentType === 'series') {
    if ($epBadge.length > 0) {
      status = $epBadge.hasClass('complete') ? 'completed' : 'ongoing';
      const epNum = Number.parseInt($epBadge.find('strong').text().trim() || $epBadge.text().replace(/\D+/g, ''), 10);
      if (Number.isFinite(epNum)) totalEpisodes = epNum;
    }
    const seasonMatch = durationText?.match(/^S\.(\d+)/i);
    if (seasonMatch) totalSeasons = Number.parseInt(seasonMatch[1], 10);
  } else {
    status = 'released';
    quality = cleanText($labelBadge.text());
    duration = durationText;
  }

  return normalizeContentRecord({
    source_slug: slug,
    slug,
    title,
    content_type: contentType,
    poster_url: posterUrl,
    release_year: normalizeYear(yearText || title),
    rating: normalizeRating(ratingText),
    duration,
    quality,
    status,
    genres,
    total_seasons: totalSeasons,
    total_episodes: totalEpisodes,
    detail_source_url: detailUrl,
    ...flags,
  });
}

export function parseCardsFromContainer($, container, options = {}) {
  const items = [];
  $(container)
    .find('article')
    .each((_, el) => {
      const parsed = parseCard($, el, options);
      if (parsed) items.push(parsed);
    });
  return items;
}
