import { z } from 'zod';
import { setCrawlerPaused } from '../../../src/database/jobs.js';
import { createApiHandler } from '../../../src/middleware/error-handler.js';
import { sendSuccess } from '../../../src/utils/response.js';
import { validateQuery } from '../../../src/utils/validator.js';

const controlSchema = z.object({
  action: z.enum(['pause', 'resume']),
});

export default createApiHandler({ methods: ['POST'], auth: 'admin' }, async (req, res) => {
  const { action } = validateQuery(controlSchema, req.body || req.query);
  const state = await setCrawlerPaused(action === 'pause', 'admin_api');
  sendSuccess(res, { paused: Boolean(state.value?.paused), state: state.value }, { cached: false });
});
