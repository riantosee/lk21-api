import { config } from '../../../config/index.js';
import { getContentBySlug } from '../../../database/contents.js';
import { getEpisodesByContentId } from '../../../database/episodes.js';
import { createApiHandler } from '../../../middleware/error-handler.js';
import { withCache } from '../../../services/cache.js';
import { buildPagination, sendError, sendSuccess } from '../../../utils/response.js';
import { episodesQuerySchema, slugParamSchema, validateQuery } from '../../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const slug = validateQuery(slugParamSchema, req.query?.slug);
  const q = validateQuery(episodesQuerySchema, req.query);
  const cacheKey = `eps:${slug}:s${q.season ?? 'all'}:p${q.page}:l${q.limit}`;

  const { value, cached } = await withCache('episodes', cacheKey, config.cacheTtl.episodes, async () => {
    const content = await getContentBySlug(slug);
    if (!content) return null;
    const result = await getEpisodesByContentId(content.id, {
      season: q.season,
      page: q.page,
      limit: q.limit,
    });
    return {
      slug: content.slug,
      title: content.title,
      content_type: content.content_type,
      ...result,
    };
  });

  if (!value) {
    return sendError(res, 404, 'RESOURCE_NOT_FOUND', 'Content not found');
  }

  sendSuccess(res, value.items, {
    pagination: buildPagination({ page: q.page, limit: q.limit, total: value.total }),
    cached,
    meta: {
      slug: value.slug,
      title: value.title,
      season: q.season ?? null,
    },
  });
});
