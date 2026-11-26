import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import homeHandler from '../src/routes/v1/home.js';
import latestHandler from '../src/routes/v1/latest.js';
import moviesHandler from '../src/routes/v1/movies.js';
import seriesHandler from '../src/routes/v1/series.js';
import popularHandler from '../src/routes/v1/popular.js';
import recommendationsHandler from '../src/routes/v1/recommendations.js';
import ongoingHandler from '../src/routes/v1/ongoing.js';
import completedHandler from '../src/routes/v1/completed.js';
import genresHandler from '../src/routes/v1/genres/index.js';
import genreSlugHandler from '../src/routes/v1/genres/[slug].js';
import countriesHandler from '../src/routes/v1/countries/index.js';
import countrySlugHandler from '../src/routes/v1/countries/[slug].js';
import yearsHandler from '../src/routes/v1/years/index.js';
import yearParamHandler from '../src/routes/v1/years/[year].js';
import searchHandler from '../src/routes/v1/search.js';
import detailHandler from '../src/routes/v1/detail/[slug].js';
import seasonsHandler from '../src/routes/v1/seasons/[slug].js';
import episodesHandler from '../src/routes/v1/episodes/[slug].js';
import healthHandler from '../src/routes/v1/health.js';
import adminSyncHandler from '../src/routes/v1/admin/sync.js';
import adminStatusHandler from '../src/routes/v1/admin/status.js';
import adminJobsHandler from '../src/routes/v1/admin/jobs.js';
import adminRetryHandler from '../src/routes/v1/admin/jobs/retry.js';
import adminControlHandler from '../src/routes/v1/admin/control.js';
import adminHistoryHandler from '../src/routes/v1/admin/history.js';
import cronQuickSyncHandler from '../src/routes/v1/cron/quick-sync.js';
import cronDetailSyncHandler from '../src/routes/v1/cron/detail-sync.js';
import cronEpisodeSyncHandler from '../src/routes/v1/cron/episode-sync.js';
import { applyCors } from '../src/middleware/error-handler.js';
import { sendError, sendSuccess } from '../src/utils/response.js';

const STATIC_ROUTES = new Map([
  ['/api/v1/home', homeHandler],
  ['/api/v1/latest', latestHandler],
  ['/api/v1/movies', moviesHandler],
  ['/api/v1/series', seriesHandler],
  ['/api/v1/popular', popularHandler],
  ['/api/v1/recommendations', recommendationsHandler],
  ['/api/v1/ongoing', ongoingHandler],
  ['/api/v1/completed', completedHandler],
  ['/api/v1/genres', genresHandler],
  ['/api/v1/countries', countriesHandler],
  ['/api/v1/years', yearsHandler],
  ['/api/v1/search', searchHandler],
  ['/api/v1/health', healthHandler],
  ['/api/v1/admin/sync', adminSyncHandler],
  ['/api/v1/admin/status', adminStatusHandler],
  ['/api/v1/admin/jobs', adminJobsHandler],
  ['/api/v1/admin/jobs/retry', adminRetryHandler],
  ['/api/v1/admin/control', adminControlHandler],
  ['/api/v1/admin/history', adminHistoryHandler],
  ['/api/v1/cron/quick-sync', cronQuickSyncHandler],
  ['/api/v1/cron/detail-sync', cronDetailSyncHandler],
  ['/api/v1/cron/episode-sync', cronEpisodeSyncHandler],
]);

const DYNAMIC_ROUTES = [
  { regex: /^\/api\/v1\/genres\/([^/]+)$/, param: 'slug', handler: genreSlugHandler },
  { regex: /^\/api\/v1\/countries\/([^/]+)$/, param: 'slug', handler: countrySlugHandler },
  { regex: /^\/api\/v1\/years\/([^/]+)$/, param: 'year', handler: yearParamHandler },
  { regex: /^\/api\/v1\/detail\/([^/]+)$/, param: 'slug', handler: detailHandler },
  { regex: /^\/api\/v1\/seasons\/([^/]+)$/, param: 'slug', handler: seasonsHandler },
  { regex: /^\/api\/v1\/episodes\/([^/]+)$/, param: 'slug', handler: episodesHandler },
];

function extractPathname(req) {
  try {
    const raw = req.url || '/';
    const url = new URL(raw, 'http://localhost');
    const clean = url.pathname.replace(/\/+$/, '') || '/';
    return { pathname: clean, searchParams: url.searchParams };
  } catch {
    return { pathname: '/', searchParams: new URLSearchParams() };
  }
}

export default async function handler(req, res) {
  applyCors(req, res);

  if ((req.method || 'GET').toUpperCase() === 'OPTIONS') {
    res.status(204).end?.();
    return;
  }

  const { pathname, searchParams } = extractPathname(req);

  if (pathname === '/api/v1/openapi' || pathname === '/api/v1/openapi.yaml') {
    const specPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/openapi.yaml');
    const yaml = fs.readFileSync(specPath, 'utf8');
    res.setHeader?.('Content-Type', 'application/yaml; charset=utf-8');
    res.setHeader?.('Cache-Control', 'public, s-maxage=3600');
    res.status(200).end?.(yaml);
    return;
  }

  if (pathname === '/' || pathname === '/api' || pathname === '/api/v1') {
    return sendSuccess(res, {
      name: 'NontonDrama / LK21 Public Metadata API',
      version: '1.0.0',
      docs: '/api/v1/openapi.yaml',
      health: '/api/v1/health',
      endpoints: [
        '/api/v1/home',
        '/api/v1/latest',
        '/api/v1/movies',
        '/api/v1/series',
        '/api/v1/popular',
        '/api/v1/recommendations',
        '/api/v1/ongoing',
        '/api/v1/completed',
        '/api/v1/genres',
        '/api/v1/genres/:slug',
        '/api/v1/countries',
        '/api/v1/countries/:slug',
        '/api/v1/years',
        '/api/v1/years/:year',
        '/api/v1/search?q=',
        '/api/v1/detail/:slug',
        '/api/v1/seasons/:slug',
        '/api/v1/episodes/:slug',
        '/api/v1/health',
      ],
    });
  }

  // Ensure query object is populated when invoked outside Express/Next
  if (!req.query) {
    req.query = Object.fromEntries(searchParams.entries());
  }

  const staticHandler = STATIC_ROUTES.get(pathname);
  if (staticHandler) {
    return staticHandler(req, res);
  }

  for (const route of DYNAMIC_ROUTES) {
    const match = pathname.match(route.regex);
    if (match) {
      req.query = { ...req.query, [route.param]: decodeURIComponent(match[1]) };
      return route.handler(req, res);
    }
  }

  return sendError(res, 404, 'ROUTE_NOT_FOUND', `Endpoint ${pathname} not found`);
}
