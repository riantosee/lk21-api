import { config } from '../config/index.js';
import { scrapeCatalog } from './catalog.js';

export const MOVIE_CATALOG_PATHS = {
  latest: '/latest',
  featured: '/top-movie-today',
  popular: '/populer',
  rating: '/rating',
  release: '/release',
};

export function scrapeLatestMovies(options = {}) {
  return scrapeCatalog(MOVIE_CATALOG_PATHS.latest, {
    baseUrl: config.source.movieBaseUrl,
    defaultType: 'movie',
    ...options,
  });
}

export function scrapeFeaturedMovies(options = {}) {
  return scrapeCatalog(MOVIE_CATALOG_PATHS.featured, {
    baseUrl: config.source.movieBaseUrl,
    defaultType: 'movie',
    flags: { is_featured: true },
    ...options,
  });
}

export function scrapePopularMovies(options = {}) {
  return scrapeCatalog(MOVIE_CATALOG_PATHS.popular, {
    baseUrl: config.source.movieBaseUrl,
    defaultType: 'movie',
    flags: { is_popular: true },
    ...options,
  });
}

export function scrapeMovieCatalog(path = MOVIE_CATALOG_PATHS.latest, options = {}) {
  return scrapeCatalog(path, {
    baseUrl: config.source.movieBaseUrl,
    defaultType: 'movie',
    ...options,
  });
}
