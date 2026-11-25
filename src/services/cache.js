import { Redis } from '@upstash/redis';
import { config, isRedisConfigured } from '../config/index.js';
import { logger } from '../utils/logger.js';

let redisInstance = null;

export const CACHE_NAMESPACES = [
  'home',
  'catalog',
  'popular',
  'recommendations',
  'search',
  'detail',
  'taxonomy',
  'episodes',
];

function getRedis() {
  if (redisInstance) return redisInstance;
  if (!isRedisConfigured()) return null;
  redisInstance = new Redis({
    url: config.redis.url,
    token: config.redis.token,
  });
  return redisInstance;
}

/** Testing hook to inject a mock Redis client or disable Redis (null). */
export function setCacheClient(customClient) {
  redisInstance = customClient;
}

async function getNamespaceVersion(redis, namespace) {
  const verKey = `nd:v:${namespace}`;
  const v = await redis.get(verKey);
  return v !== null && v !== undefined ? String(v) : '0';
}

export async function getCache(namespace, key) {
  const redis = getRedis();
  if (!redis) return { hit: false, value: null };
  try {
    const ver = await getNamespaceVersion(redis, namespace);
    const fullKey = `nd:${namespace}:v${ver}:${key}`;
    const value = await redis.get(fullKey);
    if (value === null || value === undefined) return { hit: false, value: null };
    return { hit: true, value };
  } catch (err) {
    logger.warn({ namespace, key, err: err.message }, 'Redis GET failed; falling back to database');
    return { hit: false, value: null };
  }
}

export async function setCache(namespace, key, value, ttlSeconds) {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const ver = await getNamespaceVersion(redis, namespace);
    const fullKey = `nd:${namespace}:v${ver}:${key}`;
    await redis.set(fullKey, value, { ex: ttlSeconds });
    return true;
  } catch (err) {
    logger.warn({ namespace, key, err: err.message }, 'Redis SET failed; continuing without cache');
    return false;
  }
}

export async function withCache(namespace, key, ttlSeconds, loader) {
  const cached = await getCache(namespace, key);
  if (cached.hit) {
    return { value: cached.value, cached: true };
  }
  const value = await loader();
  await setCache(namespace, key, value, ttlSeconds);
  return { value, cached: false };
}

export async function invalidateNamespaces(namespaces = CACHE_NAMESPACES) {
  const redis = getRedis();
  if (!redis) return { invalidated: [], skipped: true };
  const invalidated = [];
  for (const ns of namespaces) {
    try {
      await redis.incr(`nd:v:${ns}`);
      invalidated.push(ns);
    } catch (err) {
      logger.warn({ namespace: ns, err: err.message }, 'Redis namespace invalidation failed');
    }
  }
  return { invalidated, skipped: false };
}

export async function checkCacheHealth() {
  const redis = getRedis();
  if (!redis) {
    return { status: 'disabled', healthy: true, latencyMs: null };
  }
  const started = Date.now();
  try {
    await redis.ping();
    return { status: 'connected', healthy: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { status: 'error', healthy: false, latencyMs: Date.now() - started, message: err.message };
  }
}

export { getRedis };
