import { config } from '../../../src/config/index.js';
import { listYears } from '../../../src/database/contents.js';
import { createApiHandler } from '../../../src/middleware/error-handler.js';
import { withCache } from '../../../src/services/cache.js';
import { sendSuccess } from '../../../src/utils/response.js';

export default createApiHandler({ methods: ['GET'] }, async (_req, res) => {
  const { value, cached } = await withCache('taxonomy', 'years:list', config.cacheTtl.years, () => listYears());
  sendSuccess(res, value, { cached });
});
