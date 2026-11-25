import { config } from '../config/index.js';
import { scrapeCatalog, scrapeRecommendationFeed } from './catalog.js';

export const SERIES_CATALOG_PATHS = {
  latest: '/latest-series',
  featured: '/top-series-today',
  popular: '/populer',
  ongoing: '/series/ongoing',
  completed: '/series/complete',
  asian: '/series/asian',
  west: '/series/west',
  release: '/release',
  rating: '/rating',
  drakor: '/maraton-drakor',
  family: '/nonton-bareng-keluarga',
};

export function scrapeLatestSeries(options = {}) {
  return scrapeCatalog(SERIES_CATALOG_PATHS.latest, {
    baseUrl: config.source.baseUrl,
    defaultType: 'series',
    ...options,
  });
}

export function scrapeFeaturedSeries(options = {}) {
  return scrapeCatalog(SERIES_CATALOG_PATHS.featured, {
    baseUrl: config.source.baseUrl,
    defaultType: 'series',
    flags: { is_featured: true },
    ...options,
  });
}

export function scrapePopularSeries(options = {}) {
  return scrapeCatalog(SERIES_CATALOG_PATHS.popular, {
    baseUrl: config.source.baseUrl,
    defaultType: 'series',
    flags: { is_popular: true },
    ...options,
  });
}

export function scrapeOngoingSeries(options = {}) {
  return scrapeCatalog(SERIES_CATALOG_PATHS.ongoing, {
    baseUrl: config.source.baseUrl,
    defaultType: 'series',
    flags: { status: 'ongoing' },
    ...options,
  });
}

export function scrapeCompletedSeries(options = {}) {
  return scrapeCatalog(SERIES_CATALOG_PATHS.completed, {
    baseUrl: config.source.baseUrl,
    defaultType: 'series',
    flags: { status: 'completed' },
    ...options,
  });
}

export function scrapeAsianSeries(options = {}) {
  return scrapeCatalog(SERIES_CATALOG_PATHS.asian, {
    baseUrl: config.source.baseUrl,
    defaultType: 'series',
    flags: { region: 'Asian' },
    ...options,
  });
}

export function scrapeWesternSeries(options = {}) {
  return scrapeCatalog(SERIES_CATALOG_PATHS.west, {
    baseUrl: config.source.baseUrl,
    defaultType: 'series',
    flags: { region: 'West' },
    ...options,
  });
}

export function scrapeRecommendedSeries(options = {}) {
  return scrapeRecommendationFeed({
    baseUrl: config.source.baseUrl,
    type: 'series',
    ...options,
  });
}
