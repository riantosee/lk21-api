import 'dotenv/config';

const stripTrailingSlash = (url) => (url ? url.replace(/\/+$/, '') : '');
const toInt = (val, fallback) => {
  const n = Number.parseInt(val ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL || '',
    token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  },
  security: {
    adminApiSecret: process.env.ADMIN_API_SECRET || '',
    cronSecret: process.env.CRON_SECRET || '',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMaxRequests: toInt(process.env.RATE_LIMIT_MAX_REQUESTS, 120),
  },
  source: {
    baseUrl: stripTrailingSlash(process.env.SOURCE_BASE_URL || 'https://tv1.nontondrama.vip'),
    movieBaseUrl: stripTrailingSlash(process.env.MOVIE_SOURCE_BASE_URL || 'https://tv13.lk21official.cc'),
    searchApiBaseUrl: stripTrailingSlash(process.env.SEARCH_API_BASE_URL || 'https://gudangvape.com'),
    thumbnailBaseUrl: (process.env.THUMBNAIL_BASE_URL || 'https://poster.assetsy.de/wp-content/uploads/').replace(/\/?$/, '/'),
  },
  scraper: {
    delayMs: Math.max(100, toInt(process.env.SCRAPER_DELAY_MS, 500)),
    concurrency: Math.max(1, Math.min(5, toInt(process.env.SCRAPER_CONCURRENCY, 2))),
    timeoutMs: Math.max(3000, toInt(process.env.SCRAPER_TIMEOUT_MS, 15_000)),
    maxRetries: Math.max(0, Math.min(5, toInt(process.env.SCRAPER_MAX_RETRIES, 3))),
    maxPagesPerRun: Math.max(1, toInt(process.env.SCRAPER_MAX_PAGES_PER_RUN, 10)),
    detailBatchSize: Math.max(1, toInt(process.env.SCRAPER_DETAIL_BATCH_SIZE, 20)),
    userAgent: process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (compatible; NontonDramaMetadataBot/1.0)',
  },
  cacheTtl: {
    home: 300,
    latest: 600,
    popular: 900,
    recommendations: 600,
    search: 300,
    detail: 3600,
    genres: 86_400,
    countries: 86_400,
    years: 86_400,
    episodes: 3600,
    catalog: 600,
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

export function isSupabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.serviceRoleKey);
}

export function isRedisConfigured() {
  return Boolean(config.redis.url && config.redis.token);
}
