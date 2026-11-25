import crypto from 'node:crypto';
import { config } from '../config/index.js';

function safeCompare(a, b) {
  if (!a || !b || typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return null;
}

export function verifyAdminAuth(req) {
  const expected = config.security.adminApiSecret;
  if (!expected) {
    const err = new Error('Admin authentication is not configured');
    err.statusCode = 503;
    err.code = 'AUTH_NOT_CONFIGURED';
    throw err;
  }

  const provided =
    extractBearerToken(req) ||
    req.headers?.['x-admin-secret'] ||
    req.headers?.['x-api-key'] ||
    null;

  if (!provided) {
    const err = new Error('Missing admin authentication credentials');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  if (!safeCompare(String(provided), expected)) {
    const err = new Error('Invalid admin authentication credentials');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }
}

export function verifyCronAuth(req) {
  const cronSecret = config.security.cronSecret;
  const adminSecret = config.security.adminApiSecret;
  if (!cronSecret && !adminSecret) {
    const err = new Error('Cron authentication is not configured');
    err.statusCode = 503;
    err.code = 'AUTH_NOT_CONFIGURED';
    throw err;
  }

  const provided =
    extractBearerToken(req) ||
    req.headers?.['x-cron-secret'] ||
    req.headers?.['x-admin-secret'] ||
    null;

  if (!provided) {
    const err = new Error('Missing cron authentication credentials');
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    throw err;
  }

  const validCron = cronSecret && safeCompare(String(provided), cronSecret);
  const validAdmin = adminSecret && safeCompare(String(provided), adminSecret);
  if (!validCron && !validAdmin) {
    const err = new Error('Invalid cron authentication credentials');
    err.statusCode = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }
}
