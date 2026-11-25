import { config } from '../../../config/index.js';
import { listYears } from '../../../database/contents.js';
import { createApiHandler } from '../../../middleware/error-handler.js';
import { withCache } from '../../../services/cache.js';
import { sendSuccess } from '../../../utils/response.js';

export default createApiHandler({ methods: ['GET'] }, async (_req, res) => {
  const { value, cached } = await withCache('taxonomy', 'years:list', config.cacheTtl.years, () => listYears());
  sendSuccess(res, value, { cached });
});
