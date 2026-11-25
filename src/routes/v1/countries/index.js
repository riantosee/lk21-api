import { config } from '../../../config/index.js';
import { listCountries } from '../../../database/contents.js';
import { createApiHandler } from '../../../middleware/error-handler.js';
import { withCache } from '../../../services/cache.js';
import { sendSuccess } from '../../../utils/response.js';

export default createApiHandler({ methods: ['GET'] }, async (_req, res) => {
  const { value, cached } = await withCache('taxonomy', 'countries:list', config.cacheTtl.countries, () =>
    listCountries()
  );
  sendSuccess(res, value, { cached });
});
