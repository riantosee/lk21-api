import { config } from '../../src/config/index.js';
import { listContents } from '../../src/database/contents.js';
import { createApiHandler } from '../../src/middleware/error-handler.js';
import { withCache } from '../../src/services/cache.js';
import { buildPagination, sendSuccess } from '../../src/utils/response.js';
import { paginationQuerySchema, validateQuery } from '../../src/utils/validator.js';

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
