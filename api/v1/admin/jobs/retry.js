import { z } from 'zod';
import { createApiHandler } from '../../../../src/middleware/error-handler.js';
import { retryFailedJobs } from '../../../../src/services/sync.js';
import { sendSuccess } from '../../../../src/utils/response.js';
import { validateQuery } from '../../../../src/utils/validator.js';

const retrySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(5),
});

export default createApiHandler({ methods: ['POST'], auth: 'admin' }, async (req, res) => {
  const { limit } = validateQuery(retrySchema, req.body || req.query);
  const result = await retryFailedJobs({ limit });
  sendSuccess(res, result, { cached: false });
});
