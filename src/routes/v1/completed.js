import { config } from '../../config/index.js';
import { listContents } from '../../database/contents.js';
import { createApiHandler } from '../../middleware/error-handler.js';
import { withCache } from '../../services/cache.js';
import { buildPagination, sendSuccess } from '../../utils/response.js';
import { catalogFilterQuerySchema, validateQuery } from '../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const q = validateQuery(catalogFilterQuerySchema, req.query);
  const cacheKey = `completed:p${q.page}:l${q.limit}:g${q.genre || ''}:c${q.country || ''}`;

  const { value, cached } = await withCache('catalog', cacheKey, config.cacheTtl.catalog, () =>
    listContents({
      type: 'series',
      status: 'completed',
      page: q.page,
      limit: q.limit,
      genre: q.genre,
      country: q.country,
      sort: 'latest',
      order: 'desc',
    })
  );

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page: q.page, limit: q.limit, total: value.total }),
    cached,
  });
});
