import { config } from '../../src/config/index.js';
import { searchContents } from '../../src/database/contents.js';
import { createApiHandler } from '../../src/middleware/error-handler.js';
import { withCache } from '../../src/services/cache.js';
import { buildPagination, sendSuccess } from '../../src/utils/response.js';
import { searchQuerySchema, validateQuery } from '../../src/utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const q = validateQuery(searchQuerySchema, req.query);
  const cacheKey = `q:${q.q.toLowerCase()}:p${q.page}:l${q.limit}:t${q.type || ''}:y${q.year || ''}:g${q.genre || ''}`;

  const { value, cached } = await withCache('search', cacheKey, config.cacheTtl.search, () =>
    searchContents({
      q: q.q,
      type: q.type,
      year: q.year,
      genre: q.genre,
      page: q.page,
      limit: q.limit,
    })
  );

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page: q.page, limit: q.limit, total: value.total }),
    cached,
    meta: { query: q.q },
  });
});
