import { config } from '../../config/index.js';
import { listContents } from '../../database/contents.js';
import { createApiHandler } from '../../middleware/error-handler.js';
import { withCache } from '../../services/cache.js';
import { buildPagination, sendSuccess } from '../../utils/response.js';
import { paginationQuerySchema, validateQuery } from '../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const { page, limit } = validateQuery(paginationQuerySchema, req.query);
  const cacheKey = `recommendations:p${page}:l${limit}`;

  const { value, cached } = await withCache('recommendations', cacheKey, config.cacheTtl.recommendations, () =>
    listContents({ isRecommended: true, page, limit, sort: 'rating', order: 'desc' })
  );

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page, limit, total: value.total }),
    cached,
  });
});
