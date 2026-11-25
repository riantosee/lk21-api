import { config } from '../../config/index.js';
import { listContents } from '../../database/contents.js';
import { createApiHandler } from '../../middleware/error-handler.js';
import { withCache } from '../../services/cache.js';
import { buildPagination, sendSuccess } from '../../utils/response.js';
import { catalogFilterQuerySchema, validateQuery } from '../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const q = validateQuery(catalogFilterQuerySchema, req.query);
  const cacheKey = `series:p${q.page}:l${q.limit}:y${q.year || ''}:g${q.genre || ''}:c${q.country || ''}:st${q.status || ''}:s${q.sort}:${q.order}`;

  const { value, cached } = await withCache('catalog', cacheKey, config.cacheTtl.catalog, () =>
    listContents({
      type: 'series',
      page: q.page,
      limit: q.limit,
      year: q.year,
      genre: q.genre,
      country: q.country,
      status: q.status,
      sort: q.sort,
      order: q.order,
    })
  );

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page: q.page, limit: q.limit, total: value.total }),
    cached,
  });
});
