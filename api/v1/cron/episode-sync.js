import { createApiHandler } from '../../../src/middleware/error-handler.js';
import { runEpisodeSync } from '../../../src/services/sync.js';
import { sendSuccess } from '../../../src/utils/response.js';

export default createApiHandler({ methods: ['GET', 'POST'], auth: 'cron', rateLimit: false }, async (_req, res) => {
  const result = await runEpisodeSync({ batchSize: 10, enrichEpisodes: false });
  sendSuccess(res, result, { cached: false });
});
