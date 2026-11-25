import { config } from '../../../src/config/index.js';
import { getGenreBySlug, listContents } from '../../../src/database/contents.js';
import { createApiHandler } from '../../../src/middleware/error-handler.js';
import { withCache } from '../../../src/services/cache.js';
import { buildPagination, sendSuccess } from '../../../src/utils/response.js';
import { catalogFilterQuerySchema, slugParamSchema, validateQuery } from '../../../src/utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const slug = validateQuery(slugParamSchema, req.query?.slug);
  const q = validateQuery(catalogFilterQuerySchema, req.query);
  const cacheKey = `genre:${slug}:p${q.page}:l${q.limit}:t${req.query?.type || ''}:s${q.sort}:${q.order}`;

  const { value, cached } = await withCache('taxonomy', cacheKey, config.cacheTtl.genres, async () => {
    const genreRow = await getGenreBySlug(slug);
    const genreName = genreRow?.name || slug;
    const type = req.query?.type === 'movie' || req.query?.type === 'series' ? req.query.type : undefined;
    const result = await listContents({
      genre: genreName,
      type,
      page: q.page,
      limit: q.limit,
      sort: q.sort,
      order: q.order,
    });
    return { genre: genreRow || { slug, name: genreName }, ...result };
  });

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page: q.page, limit: q.limit, total: value.total }),
    cached,
    meta: { genre: value.genre },
  });
});
