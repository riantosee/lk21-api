import { config } from '../../../config/index.js';
import { getContentBySlug, getRelatedContents } from '../../../database/contents.js';
import { getSeasonsByContentId } from '../../../database/seasons.js';
import { createApiHandler } from '../../../middleware/error-handler.js';
import { withCache } from '../../../services/cache.js';
import { sendError, sendSuccess } from '../../../utils/response.js';
import { slugParamSchema, validateQuery } from '../../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const slug = validateQuery(slugParamSchema, req.query?.slug);

  const { value, cached } = await withCache('detail', `slug:${slug}`, config.cacheTtl.detail, async () => {
    const content = await getContentBySlug(slug);
    if (!content) return null;

    const [related, seasons] = await Promise.all([
      getRelatedContents(content, 10),
      content.content_type === 'series' ? getSeasonsByContentId(content.id) : Promise.resolve([]),
    ]);

    return {
      ...content,
      related,
      seasons: content.content_type === 'series' ? seasons : [],
    };
  });

  if (!value) {
    return sendError(res, 404, 'RESOURCE_NOT_FOUND', 'Content not found');
  }

  sendSuccess(res, value, { cached });
});
