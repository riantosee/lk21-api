import { config } from '../../../config/index.js';
import { getContentBySlug } from '../../../database/contents.js';
import { getSeasonsByContentId } from '../../../database/seasons.js';
import { createApiHandler } from '../../../middleware/error-handler.js';
import { withCache } from '../../../services/cache.js';
import { sendError, sendSuccess } from '../../../utils/response.js';
import { slugParamSchema, validateQuery } from '../../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const slug = validateQuery(slugParamSchema, req.query?.slug);

  const { value, cached } = await withCache('episodes', `seasons:${slug}`, config.cacheTtl.episodes, async () => {
    const content = await getContentBySlug(slug);
    if (!content) return null;
    const seasons = await getSeasonsByContentId(content.id);
    return {
      content_id: content.id,
      slug: content.slug,
      title: content.title,
      content_type: content.content_type,
      seasons,
    };
  });

  if (!value) {
    return sendError(res, 404, 'RESOURCE_NOT_FOUND', 'Content not found');
  }

  sendSuccess(res, value.seasons, {
    cached,
    meta: {
      slug: value.slug,
      title: value.title,
      content_type: value.content_type,
    },
  });
});
