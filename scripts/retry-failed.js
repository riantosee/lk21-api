import { retryFailedJobs } from '../src/services/sync.js';
import { logger } from '../src/utils/logger.js';

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());

const limit = Number.parseInt(process.argv[2] || '10', 10) || 10;

retryFailedJobs({ limit, signal: controller.signal })
  .then((result) => {
    logger.info({ attempted: result.attempted }, 'Retry failed jobs completed');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    logger.error({ err: err.message }, 'Retry failed jobs encountered an error');
    process.exit(1);
  });
