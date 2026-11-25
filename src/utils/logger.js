import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers["x-admin-secret"]',
      '*.token',
      '*.secret',
      '*.password',
      '*.serviceRoleKey',
      '*.apiKey',
    ],
    censor: '[REDACTED]',
  },
  base: { service: 'nontondrama-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
