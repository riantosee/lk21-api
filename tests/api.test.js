import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { setDbClient } from '../src/database/client.js';
import { resetMemoryRateLimiter } from '../src/middleware/rate-limit.js';
import { invalidateNamespaces, setCacheClient } from '../src/services/cache.js';

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
import adminStatusHandler from '../src/routes/v1/admin/status.js';
import adminControlHandler from '../src/routes/v1/admin/control.js';

import { createMockRedis, createMockRes, createMockSupabase } from './helpers/mock-stores.js';

const SEED_CONTENTS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    source_id: '35115',
    source_slug: 'remarried-empress-2026',
    slug: 'remarried-empress-2026',
    title: 'The Remarried Empress',
    original_title: null,
    content_type: 'series',
    poster_url: 'https://poster.assetsy.de/emp.jpg',
    backdrop_url: null,
    synopsis: 'Palace drama.',
    release_year: 2026,
    rating: 9.5,
    status: 'ongoing',
    country: 'South Korea',
    director: 'Jo Soo-won',
    cast: ['Shin Min-a'],
    genres: ['Drama', 'Romance'],
    related_slugs: [],
    is_featured: true,
    is_popular: true,
    is_recommended: true,
    total_seasons: 1,
    total_episodes: 2,
    detail_source_url: 'https://tv1.nontondrama.vip/remarried-empress-2026',
    scraped_at: '2026-11-25T12:00:00.000Z',
    created_at: '2026-11-25T12:00:00.000Z',
    updated_at: '2026-11-25T12:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    source_id: '35288',
    source_slug: 'fjord-2026',
    slug: 'fjord-2026',
    title: 'Fjord',
    original_title: null,
    content_type: 'movie',
    poster_url: 'https://poster.assetsy.de/fjord.jpg',
    backdrop_url: null,
    synopsis: 'A gripping movie.',
    release_year: 2026,
    rating: 7.6,
    duration: '2h 27m',
    quality: 'WEBDL 1080p',
    status: 'released',
    country: 'Romania',
    director: 'Cristian Mungiu',
    cast: ['Actor One'],
    genres: ['Drama', 'Thriller'],
    related_slugs: [],
    is_featured: false,
    is_popular: true,
    is_recommended: false,
    detail_source_url: 'https://tv13.lk21official.cc/fjord-2026',
    scraped_at: '2026-11-25T11:00:00.000Z',
    created_at: '2026-11-25T11:00:00.000Z',
    updated_at: '2026-11-25T11:00:00.000Z',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    source_id: '10001',
    source_slug: 'defected-2019',
    slug: 'defected-2019',
    title: 'The Defected',
    content_type: 'series',
    release_year: 2019,
    rating: 8.9,
    status: 'completed',
    country: 'Hong Kong',
    genres: ['Action', 'Crime'],
    is_featured: false,
    is_popular: false,
    is_recommended: true,
    detail_source_url: 'https://tv1.nontondrama.vip/defected-2019',
    scraped_at: '2026-11-25T10:00:00.000Z',
    created_at: '2026-11-25T10:00:00.000Z',
    updated_at: '2026-11-25T10:00:00.000Z',
  },
];

const SEED_SEASONS = [
  {
    id: 'aaaa1111-1111-1111-1111-111111111111',
    content_id: '11111111-1111-1111-1111-111111111111',
    season_number: 1,
    season_title: 'Season 1',
    description: null,
    episode_count: 2,
  },
];

const SEED_EPISODES = [
  {
    id: 'eeee1111-1111-1111-1111-111111111111',
    content_id: '11111111-1111-1111-1111-111111111111',
    season_id: 'aaaa1111-1111-1111-1111-111111111111',
    episode_number: 1,
    episode_title: 'Episode 1',
    episode_slug: 'remarried-empress-season-1-episode-1-2026',
    source_url: 'https://tv1.nontondrama.vip/remarried-empress-season-1-episode-1-2026',
  },
  {
    id: 'eeee2222-2222-2222-2222-222222222222',
    content_id: '11111111-1111-1111-1111-111111111111',
    season_id: 'aaaa1111-1111-1111-1111-111111111111',
    episode_number: 2,
    episode_title: 'Episode 2',
    episode_slug: 'remarried-empress-season-1-episode-2-2026',
    source_url: 'https://tv1.nontondrama.vip/remarried-empress-season-1-episode-2-2026',
  },
];

describe('REST API Endpoints, Caching, Auth & Rate Limiting', () => {
  const originalAdminSecret = config.security.adminApiSecret;
  const originalMaxReq = config.security.rateLimitMaxRequests;

  beforeEach(() => {
    resetMemoryRateLimiter();
    config.security.adminApiSecret = 'test-admin-secret-123';
    config.security.rateLimitMaxRequests = 100;
    setCacheClient(null);
    setDbClient(
      createMockSupabase({
        contents: SEED_CONTENTS,
        seasons: SEED_SEASONS,
        episodes: SEED_EPISODES,
        genres: [
          { id: 'g1', name: 'Drama', slug: 'drama', source_url: 'https://tv1.nontondrama.vip/genre/drama' },
          { id: 'g2', name: 'Action', slug: 'action', source_url: 'https://tv1.nontondrama.vip/genre/action' },
        ],
        countries: [
          { id: 'c1', name: 'South Korea', slug: 'south-korea', source_url: 'https://tv1.nontondrama.vip/country/south-korea' },
        ],
        sync_logs: [{ id: 's1', sync_type: 'quick_sync', status: 'completed', started_at: '2026-11-25T12:00:00Z' }],
      })
    );
  });

  afterEach(() => {
    config.security.adminApiSecret = originalAdminSecret;
    config.security.rateLimitMaxRequests = originalMaxReq;
    setCacheClient(null);
  });

  it('serves homepage, latest, movies, series, popular, recommendations, ongoing, and completed endpoints', async () => {
    const homeRes = createMockRes();
    await homeHandler({ method: 'GET', query: {}, headers: {} }, homeRes);
    expect(homeRes.statusCode).toBe(200);
    expect(homeRes.body.success).toBe(true);
    expect(homeRes.body.data.featured.items).toHaveLength(1);
    expect(homeRes.body.data.latest_movies.items).toHaveLength(1);
    expect(homeRes.body.data.ongoing.items).toHaveLength(1);
    expect(homeRes.body.data.completed.items).toHaveLength(1);

    const latestRes = createMockRes();
    await latestHandler({ method: 'GET', query: { page: '1', limit: '20', type: 'series' }, headers: {} }, latestRes);
    expect(latestRes.statusCode).toBe(200);
    expect(latestRes.body.data).toHaveLength(2);
    expect(latestRes.body.pagination.total).toBe(2);

    const moviesRes = createMockRes();
    await moviesHandler({ method: 'GET', query: { year: '2026' }, headers: {} }, moviesRes);
    expect(moviesRes.body.data).toHaveLength(1);
    expect(moviesRes.body.data[0].slug).toBe('fjord-2026');

    const seriesRes = createMockRes();
    await seriesHandler({ method: 'GET', query: { status: 'ongoing', genre: 'drama' }, headers: {} }, seriesRes);
    expect(seriesRes.body.data).toHaveLength(1);
    expect(seriesRes.body.data[0].slug).toBe('remarried-empress-2026');

    const popRes = createMockRes();
    await popularHandler({ method: 'GET', query: {}, headers: {} }, popRes);
    expect(popRes.body.data).toHaveLength(2);

    const recRes = createMockRes();
    await recommendationsHandler({ method: 'GET', query: {}, headers: {} }, recRes);
    expect(recRes.body.data).toHaveLength(2);

    const onRes = createMockRes();
    await ongoingHandler({ method: 'GET', query: {}, headers: {} }, onRes);
    expect(onRes.body.data).toHaveLength(1);

    const compRes = createMockRes();
    await completedHandler({ method: 'GET', query: {}, headers: {} }, compRes);
    expect(compRes.body.data).toHaveLength(1);
  });

  it('serves taxonomy (genres, countries, years) and search endpoints', async () => {
    const gList = createMockRes();
    await genresHandler({ method: 'GET', query: {}, headers: {} }, gList);
    expect(gList.body.data).toHaveLength(2);

    const gDrama = createMockRes();
    await genreSlugHandler({ method: 'GET', query: { slug: 'drama' }, headers: {} }, gDrama);
    expect(gDrama.body.data).toHaveLength(2);

    const cList = createMockRes();
    await countriesHandler({ method: 'GET', query: {}, headers: {} }, cList);
    expect(cList.body.data).toHaveLength(1);

    const cKr = createMockRes();
    await countrySlugHandler({ method: 'GET', query: { slug: 'south-korea' }, headers: {} }, cKr);
    expect(cKr.body.data).toHaveLength(1);

    const yList = createMockRes();
    await yearsHandler({ method: 'GET', query: {}, headers: {} }, yList);
    expect(yList.body.data[0].year).toBe(2026);

    const y2019 = createMockRes();
    await yearParamHandler({ method: 'GET', query: { year: '2019' }, headers: {} }, y2019);
    expect(y2019.body.data).toHaveLength(1);

    const sOk = createMockRes();
    await searchHandler({ method: 'GET', query: { q: 'empress' }, headers: {} }, sOk);
    expect(sOk.statusCode).toBe(200);
    expect(sOk.body.data).toHaveLength(1);

    const sBad = createMockRes();
    await searchHandler({ method: 'GET', query: {}, headers: {} }, sBad);
    expect(sBad.statusCode).toBe(400);
    expect(sBad.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('serves detail, seasons, episodes, and returns 404 for unknown slugs', async () => {
    const detRes = createMockRes();
    await detailHandler({ method: 'GET', query: { slug: 'remarried-empress-2026' }, headers: {} }, detRes);
    expect(detRes.statusCode).toBe(200);
    expect(detRes.body.data.seasons).toHaveLength(1);
    expect(detRes.body.data.director).toBe('Jo Soo-won');

    const seaRes = createMockRes();
    await seasonsHandler({ method: 'GET', query: { slug: 'remarried-empress-2026' }, headers: {} }, seaRes);
    expect(seaRes.statusCode).toBe(200);
    expect(seaRes.body.data).toHaveLength(1);

    const epRes = createMockRes();
    await episodesHandler({ method: 'GET', query: { slug: 'remarried-empress-2026', season: '1', limit: '1' }, headers: {} }, epRes);
    expect(epRes.statusCode).toBe(200);
    expect(epRes.body.data).toHaveLength(1);
    expect(epRes.body.pagination.total).toBe(2);

    const notFoundRes = createMockRes();
    await detailHandler({ method: 'GET', query: { slug: 'does-not-exist-9999' }, headers: {} }, notFoundRes);
    expect(notFoundRes.statusCode).toBe(404);
    expect(notFoundRes.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('caches responses with Redis and invalidates cleanly across namespaces', async () => {
    const mockRedis = createMockRedis();
    setCacheClient(mockRedis);

    const res1 = createMockRes();
    await latestHandler({ method: 'GET', query: { page: '1' }, headers: {} }, res1);
    expect(res1.body.meta.cached).toBe(false);

    const res2 = createMockRes();
    await latestHandler({ method: 'GET', query: { page: '1' }, headers: {} }, res2);
    expect(res2.body.meta.cached).toBe(true);

    await invalidateNamespaces(['catalog']);
    const res3 = createMockRes();
    await latestHandler({ method: 'GET', query: { page: '1' }, headers: {} }, res3);
    expect(res3.body.meta.cached).toBe(false);
  });

  it('falls back gracefully when Redis fails and reports 503 when DB is unavailable', async () => {
    setCacheClient({
      get: async () => {
        throw new Error('Redis timeout');
      },
      set: async () => {
        throw new Error('Redis timeout');
      },
      incr: async () => {
        throw new Error('Redis timeout');
      },
      ping: async () => {
        throw new Error('Redis timeout');
      },
    });

    const okRes = createMockRes();
    await latestHandler({ method: 'GET', query: {}, headers: {} }, okRes);
    expect(okRes.statusCode).toBe(200);
    expect(okRes.body.meta.cached).toBe(false);

    const healthOk = createMockRes();
    await healthHandler({ method: 'GET', query: {}, headers: {} }, healthOk);
    expect(healthOk.statusCode).toBe(200);
    expect(healthOk.body.data.database.healthy).toBe(true);
    expect(healthOk.body.data.cache.status).toBe('error');

    // Simulate unconfigured DB
    setDbClient(null);
    const prevUrl = config.supabase.url;
    config.supabase.url = '';
    const dbDownRes = createMockRes();
    await latestHandler({ method: 'GET', query: {}, headers: {} }, dbDownRes);
    expect(dbDownRes.statusCode).toBe(503);
    expect(dbDownRes.body.error.code).toBe('DATABASE_UNAVAILABLE');
    config.supabase.url = prevUrl;
  });

  it('enforces admin authentication and rate limiting', async () => {
    const noAuth = createMockRes();
    await adminStatusHandler({ method: 'GET', query: {}, headers: {} }, noAuth);
    expect(noAuth.statusCode).toBe(401);

    const badAuth = createMockRes();
    await adminStatusHandler({ method: 'GET', query: {}, headers: { authorization: 'Bearer wrong' } }, badAuth);
    expect(badAuth.statusCode).toBe(403);

    const goodAuth = createMockRes();
    await adminStatusHandler({ method: 'GET', query: {}, headers: { authorization: 'Bearer test-admin-secret-123' } }, goodAuth);
    expect(goodAuth.statusCode).toBe(200);
    expect(goodAuth.body.data.paused).toBe(false);

    const pauseRes = createMockRes();
    await adminControlHandler(
      { method: 'POST', body: { action: 'pause' }, headers: { 'x-admin-secret': 'test-admin-secret-123' } },
      pauseRes
    );
    expect(pauseRes.statusCode).toBe(200);
    expect(pauseRes.body.data.paused).toBe(true);

    // Rate limit enforcement
    config.security.rateLimitMaxRequests = 2;
    resetMemoryRateLimiter();
    for (let i = 0; i < 2; i += 1) {
      const r = createMockRes();
      await latestHandler({ method: 'GET', query: {}, headers: { 'x-forwarded-for': '1.2.3.4' } }, r);
      expect(r.statusCode).toBe(200);
    }
    const blocked = createMockRes();
    await latestHandler({ method: 'GET', query: {}, headers: { 'x-forwarded-for': '1.2.3.4' } }, blocked);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
