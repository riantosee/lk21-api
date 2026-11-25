import { config } from '../../../src/config/index.js';
import { getCountryBySlug, listContents } from '../../../src/database/contents.js';
import { createApiHandler } from '../../../src/middleware/error-handler.js';
import { withCache } from '../../../src/services/cache.js';
import { buildPagination, sendSuccess } from '../../../src/utils/response.js';
import { catalogFilterQuerySchema, slugParamSchema, validateQuery } from '../../../src/utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const slug = validateQuery(slugParamSchema, req.query?.slug);
  const q = validateQuery(catalogFilterQuerySchema, req.query);
  const cacheKey = `country:${slug}:p${q.page}:l${q.limit}:t${req.query?.type || ''}:s${q.sort}:${q.order}`;

  const { value, cached } = await withCache('taxonomy', cacheKey, config.cacheTtl.countries, async () => {
    const countryRow = await getCountryBySlug(slug);
    const countryName = countryRow?.name || slug.replace(/-/g, ' ');
    const type = req.query?.type === 'movie' || req.query?.type === 'series' ? req.query.type : undefined;
    const result = await listContents({
      country: countryName,
      type,
      page: q.page,
      limit: q.limit,
      sort: q.sort,
      order: q.order,
    });
    return { country: countryRow || { slug, name: countryName }, ...result };
  });

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page: q.page, limit: q.limit, total: value.total }),
    cached,
    meta: { country: value.country },
  });
});
