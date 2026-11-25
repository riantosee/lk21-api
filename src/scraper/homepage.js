import * as cheerio from 'cheerio';
import { config } from '../config/index.js';
import { defaultScraperClient } from './client.js';
import { parseCardsFromContainer } from './card-parser.js';
import { cleanText, deduplicateContents, resolveUrl } from '../services/normalization.js';

export function parseHomepage(html, { baseUrl = config.source.baseUrl } = {}) {
  const $ = cheerio.load(html);
  const $body = $('body');

  const runtimeConfig = {
    webType: $body.attr('data-web_type') || 'series',
    thumbnailUrl: $body.attr('data-thumbnail_url') || config.source.thumbnailBaseUrl,
    searchUrl: $body.attr('data-search_url') || config.source.searchApiBaseUrl,
  };

  const sections = {
    featured: [],
    latest_series: [],
    latest_movies: [],
    popular: [],
    recommendations: [],
    family: [],
    drakor_marathon: [],
    latest_grid: [],
  };

  // Featured carousel
  const $featured = $('section.featured').first();
  if ($featured.length) {
    sections.featured = parseCardsFromContainer($, $featured, {
      baseUrl,
      defaultType: 'series',
      flags: { is_featured: true },
    });
  }

  // Named widgets inside main
  $('.widget').each((_, el) => {
    const heading = (cleanText($(el).find('.header h2, h2').first().text()) || '').toLowerCase();
    if (!heading) return;

    if (heading === 'terbaru') {
      sections.latest_series.push(
        ...parseCardsFromContainer($, el, { baseUrl, defaultType: 'series' })
      );
    } else if (heading.includes('lk21 terbaru')) {
      sections.latest_movies.push(
        ...parseCardsFromContainer($, el, { baseUrl, defaultType: 'movie' })
      );
    } else if (heading.includes('top bulan ini') || heading.includes('terpopuler')) {
      sections.popular.push(
        ...parseCardsFromContainer($, el, { baseUrl, defaultType: 'series', flags: { is_popular: true } })
      );
    } else if (heading.includes('rekomendasi')) {
      sections.recommendations.push(
        ...parseCardsFromContainer($, el, { baseUrl, defaultType: 'series', flags: { is_recommended: true } })
      );
    } else if (heading.includes('keluarga')) {
      sections.family.push(
        ...parseCardsFromContainer($, el, { baseUrl, defaultType: 'series' })
      );
    } else if (heading.includes('maraton drakor')) {
      sections.drakor_marathon.push(
        ...parseCardsFromContainer($, el, { baseUrl, defaultType: 'series' })
      );
    } else if (heading.includes('daftar lengkap')) {
      sections.latest_grid.push(
        ...parseCardsFromContainer($, el, { baseUrl, defaultType: 'series' })
      );
    }
  });

  // Extract navigation links & filter taxonomies
  const genres = extractSelectOptions($, 'select[name="genre1"]', `${baseUrl}/genre/`);
  const countries = extractSelectOptions($, 'select[name="country"]', `${baseUrl}/country/`);
  const years = extractYearOptions($, 'select[name="tahun"]', `${baseUrl}/year/`);

  const allItems = deduplicateContents([
    ...sections.featured,
    ...sections.latest_series,
    ...sections.latest_movies,
    ...sections.popular,
    ...sections.recommendations,
    ...sections.family,
    ...sections.drakor_marathon,
    ...sections.latest_grid,
  ]);

  return {
    runtimeConfig,
    sections,
    taxonomy: { genres, countries, years },
    allItems,
  };
}

function extractSelectOptions($, selector, urlPrefix) {
  const seen = new Set();
  const out = [];
  $(selector)
    .first()
    .find('option')
    .each((_, opt) => {
      const slug = cleanText($(opt).attr('value'));
      const name = cleanText($(opt).text());
      if (!slug || !name || slug === '0' || name.startsWith('-')) return;
      const lowerSlug = slug.toLowerCase();
      if (seen.has(lowerSlug)) return;
      seen.add(lowerSlug);
      out.push({
        name,
        slug: lowerSlug,
        source_url: resolveUrl(`${urlPrefix}${lowerSlug}`, urlPrefix),
      });
    });
  return out;
}

function extractYearOptions($, selector, urlPrefix) {
  const seen = new Set();
  const out = [];
  $(selector)
    .first()
    .find('option')
    .each((_, opt) => {
      const val = Number.parseInt($(opt).attr('value') || '', 10);
      if (!Number.isFinite(val) || val < 1888 || val > 2100 || seen.has(val)) return;
      seen.add(val);
      out.push({ year: val, source_url: `${urlPrefix}${val}` });
    });
  return out.sort((a, b) => b.year - a.year);
}

export async function scrapeHomepage({ baseUrl = config.source.baseUrl, client = defaultScraperClient, signal } = {}) {
  const { html, finalUrl } = await client.fetchHtml(baseUrl, { signal });
  return {
    sourceUrl: finalUrl,
    ...parseHomepage(html, { baseUrl }),
  };
}
