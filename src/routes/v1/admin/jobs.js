import { z } from 'zod';
import { getScraperJobById, listScraperJobs } from '../../../database/jobs.js';
import { createApiHandler } from '../../../middleware/error-handler.js';
import { sendError, sendSuccess } from '../../../utils/response.js';
import { validateQuery } from '../../../utils/validator.js';

const jobsQuerySchema = z.object({
  id: z.string().uuid().optional(),
  status: z.enum(['queued', 'running', 'paused', 'completed', 'failed']).optional(),
  type: z.string().trim().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export default createApiHandler({ methods: ['GET'], auth: 'admin' }, async (req, res) => {
  const q = validateQuery(jobsQuerySchema, req.query);

  if (q.id) {
    const job = await getScraperJobById(q.id);
    if (!job) return sendError(res, 404, 'RESOURCE_NOT_FOUND', 'Scraper job not found');
    return sendSuccess(res, job, { cached: false });
  }

  const jobs = await listScraperJobs({ status: q.status, jobType: q.type, limit: q.limit });
  sendSuccess(res, jobs, { cached: false, meta: { count: jobs.length } });
});
