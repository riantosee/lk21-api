import { createApiHandler } from '../../../middleware/error-handler.js';
import { runEpisodeSync } from '../../../services/sync.js';
import { sendSuccess } from '../../../utils/response.js';

export default createApiHandler({ methods: ['GET', 'POST'], auth: 'cron', rateLimit: false }, async (_req, res) => {
  const result = await runEpisodeSync({ batchSize: 10, enrichEpisodes: false });
  sendSuccess(res, result, { cached: false });
});
