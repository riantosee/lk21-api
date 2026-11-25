import { z } from 'zod';
import { createApiHandler } from '../../../../middleware/error-handler.js';
import { retryFailedJobs } from '../../../../services/sync.js';
import { sendSuccess } from '../../../../utils/response.js';
import { validateQuery } from '../../../../utils/validator.js';

const retrySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(5),
});

export default createApiHandler({ methods: ['POST'], auth: 'admin' }, async (req, res) => {
  const { limit } = validateQuery(retrySchema, req.body || req.query);
  const result = await retryFailedJobs({ limit });
  sendSuccess(res, result, { cached: false });
});
