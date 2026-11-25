import { z } from 'zod';
import { listSyncLogs } from '../../../src/database/jobs.js';
import { createApiHandler } from '../../../src/middleware/error-handler.js';
import { sendSuccess } from '../../../src/utils/response.js';
import { validateQuery } from '../../../src/utils/validator.js';

const historySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export default createApiHandler({ methods: ['GET'], auth: 'admin' }, async (req, res) => {
  const { limit } = validateQuery(historySchema, req.query);
  const logs = await listSyncLogs(limit);
  sendSuccess(res, logs, { cached: false, meta: { count: logs.length } });
});
