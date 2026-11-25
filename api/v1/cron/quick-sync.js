import { createApiHandler } from '../../../src/middleware/error-handler.js';
import { runQuickSync } from '../../../src/services/sync.js';
import { sendSuccess } from '../../../src/utils/response.js';

export default createApiHandler({ methods: ['GET', 'POST'], auth: 'cron', rateLimit: false }, async (_req, res) => {
  const result = await runQuickSync({ maxPages: 1, includeMovies: true });
  sendSuccess(res, result, { cached: false });
});
