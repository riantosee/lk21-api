import { config } from '../../../src/config/index.js';
import { listGenres } from '../../../src/database/contents.js';
import { createApiHandler } from '../../../src/middleware/error-handler.js';
import { withCache } from '../../../src/services/cache.js';
import { sendSuccess } from '../../../src/utils/response.js';

export default createApiHandler({ methods: ['GET'] }, async (_req, res) => {
  const { value, cached } = await withCache('taxonomy', 'genres:list', config.cacheTtl.genres, () => listGenres());
  sendSuccess(res, value, { cached });
});
