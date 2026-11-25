import { runQuickSync } from '../src/services/sync.js';
import { logger } from '../src/utils/logger.js';

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());

const maxPages = Number.parseInt(process.argv[2] || '2', 10) || 2;

runQuickSync({ maxPages, includeMovies: true, signal: controller.signal })
  .then((result) => {
    logger.info({ result }, 'Quick sync completed');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((err) => {
    logger.error({ err: err.message }, 'Quick sync failed');
    process.exit(1);
  });
