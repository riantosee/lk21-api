import { config } from '../config/index.js';
import { scrapeHomepage } from './homepage.js';
import { scrapeCatalog } from './catalog.js';
import { defaultScraperClient } from './client.js';
import { slugify } from '../services/normalization.js';

export async function scrapeTaxonomy({ baseUrl = config.source.baseUrl, client = defaultScraperClient, signal } = {}) {
  const home = await scrapeHomepage({ baseUrl, client, signal });
  return home.taxonomy;
}

export async function scrapeGenreCatalog(genreSlug, options = {}) {
  const slug = slugify(genreSlug);
  return scrapeCatalog(`/genre/${slug}`, {
    defaultType: options.contentType || 'series',
    ...options,
  });
}

export async function scrapeCountryCatalog(countrySlug, options = {}) {
  const slug = slugify(countrySlug);
  return scrapeCatalog(`/country/${slug}`, {
    defaultType: options.contentType || 'series',
    ...options,
  });
}

export async function scrapeYearCatalog(year, options = {}) {
  const y = Number.parseInt(year, 10);
  if (!Number.isFinite(y) || y < 1888 || y > 2100) {
    throw new Error(`Invalid year: ${year}`);
  }
  return scrapeCatalog(`/year/${y}`, {
    defaultType: options.contentType || 'series',
    ...options,
  });
}
