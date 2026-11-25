import { config } from '../config/index.js';
import { getRedis } from '../services/cache.js';

const memoryBuckets = new Map();
const MAX_MEMORY_BUCKETS = 2000;

function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

export function resetMemoryRateLimiter() {
  memoryBuckets.clear();
}

export async function enforceRateLimit(req, res, { windowMs = config.security.rateLimitWindowMs, maxRequests = config.security.rateLimitMaxRequests } = {}) {
  const ip = getClientIp(req);
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const resetAtSec = Math.ceil(((bucket + 1) * windowMs) / 1000);

  let count = 0;
  const redis = getRedis();

  if (redis) {
    try {
      const redisKey = `nd:rl:${ip}:${bucket}`;
      count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, windowSec + 5);
      }
    } catch {
      count = incrementMemoryBucket(`${ip}:${bucket}`);
    }
  } else {
    count = incrementMemoryBucket(`${ip}:${bucket}`);
  }

  const remaining = Math.max(0, maxRequests - count);
  res.setHeader?.('X-RateLimit-Limit', String(maxRequests));
  res.setHeader?.('X-RateLimit-Remaining', String(remaining));
  res.setHeader?.('X-RateLimit-Reset', String(resetAtSec));

  if (count > maxRequests) {
    const err = new Error('Rate limit exceeded. Please try again later.');
    err.statusCode = 429;
    err.code = 'RATE_LIMIT_EXCEEDED';
    throw err;
  }
}

function incrementMemoryBucket(key) {
  if (memoryBuckets.size >= MAX_MEMORY_BUCKETS) {
    memoryBuckets.clear();
  }
  const next = (memoryBuckets.get(key) || 0) + 1;
  memoryBuckets.set(key, next);
  return next;
}
