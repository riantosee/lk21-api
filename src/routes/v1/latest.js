import { config } from '../../config/index.js';
import { listContents } from '../../database/contents.js';
import { createApiHandler } from '../../middleware/error-handler.js';
import { withCache } from '../../services/cache.js';
import { buildPagination, sendSuccess } from '../../utils/response.js';
import { latestQuerySchema, validateQuery } from '../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const { page, limit, type } = validateQuery(latestQuerySchema, req.query);
  const cacheKey = `latest:${type || 'all'}:p${page}:l${limit}`;

  const { value, cached } = await withCache('catalog', cacheKey, config.cacheTtl.latest, () =>
    listContents({ page, limit, type, sort: 'latest', order: 'desc' })
  );

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page, limit, total: value.total }),
    cached,
  });
});
