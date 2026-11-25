import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { sendError } from '../utils/response.js';
import { verifyAdminAuth, verifyCronAuth } from './auth.js';
import { enforceRateLimit } from './rate-limit.js';

export function applyCors(req, res) {
  res.setHeader?.('Access-Control-Allow-Origin', config.security.corsOrigin);
  res.setHeader?.('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader?.('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret, X-Api-Key');
}

export function createApiHandler(options, handler) {
  const opts = typeof options === 'function' ? {} : options;
  const fn = typeof options === 'function' ? options : handler;
  const allowedMethods = (opts.methods || ['GET']).map((m) => m.toUpperCase());

  return async function apiRouteHandler(req, res) {
    applyCors(req, res);

    const method = (req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      res.status(204).end?.();
      return;
    }

    if (!allowedMethods.includes(method)) {
      res.setHeader?.('Allow', allowedMethods.join(', '));
      return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed`);
    }

    try {
      if (opts.rateLimit !== false) {
        await enforceRateLimit(req, res, typeof opts.rateLimit === 'object' ? opts.rateLimit : {});
      }

      if (opts.auth === 'admin') {
        verifyAdminAuth(req);
      } else if (opts.auth === 'cron') {
        verifyCronAuth(req);
      }

      await fn(req, res);
    } catch (err) {
      const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
      const code = err?.code || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');

      if (status >= 500) {
        logger.error({ path: req.url, method, status, code, err: err?.message }, 'API handler failed');
      } else {
        logger.warn({ path: req.url, method, status, code, err: err?.message }, 'API client error');
      }

      // Never expose stack traces or internal DB details on 500 responses
      const safeMessage =
        status >= 500 && code === 'INTERNAL_SERVER_ERROR'
          ? 'An unexpected server error occurred'
          : err?.message || 'Request failed';

      sendError(res, status, code, safeMessage, err?.details);
    }
  };
}
