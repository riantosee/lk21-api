import { config } from '../../../config/index.js';
import { listContents } from '../../../database/contents.js';
import { createApiHandler } from '../../../middleware/error-handler.js';
import { withCache } from '../../../services/cache.js';
import { buildPagination, sendSuccess } from '../../../utils/response.js';
import { catalogFilterQuerySchema, validateQuery, yearParamSchema } from '../../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const year = validateQuery(yearParamSchema, req.query?.year);
  const q = validateQuery(catalogFilterQuerySchema, req.query);
  const type = req.query?.type === 'movie' || req.query?.type === 'series' ? req.query.type : undefined;
  const cacheKey = `year:${year}:p${q.page}:l${q.limit}:t${type || ''}:s${q.sort}:${q.order}`;

  const { value, cached } = await withCache('taxonomy', cacheKey, config.cacheTtl.years, () =>
    listContents({
      year,
      type,
      page: q.page,
      limit: q.limit,
      sort: q.sort,
      order: q.order,
    })
  );

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page: q.page, limit: q.limit, total: value.total }),
    cached,
    meta: { year },
  });
});
