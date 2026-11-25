import { z } from 'zod';
import { createApiHandler } from '../../../src/middleware/error-handler.js';
import {
  runDetailSync,
  runEpisodeSync,
  runFullCatalogSync,
  runQuickSync,
} from '../../../src/services/sync.js';
import { sendSuccess } from '../../../src/utils/response.js';
import { validateQuery } from '../../../src/utils/validator.js';

const syncRequestSchema = z.object({
  type: z.enum(['quick', 'full', 'detail', 'episode']),
  maxPages: z.coerce.number().int().min(1).max(20).optional(),
  startPage: z.coerce.number().int().min(1).max(1000).optional(),
  category: z.string().trim().min(1).max(60).optional(),
  batchSize: z.coerce.number().int().min(1).max(50).optional(),
  slugs: z.array(z.string().trim().min(1)).max(25).optional(),
  includeMovies: z.boolean().optional(),
  enrichEpisodes: z.boolean().optional(),
});

export default createApiHandler({ methods: ['POST'], auth: 'admin' }, async (req, res) => {
  const payload = validateQuery(syncRequestSchema, req.body || req.query);

  let result;
  if (payload.type === 'quick') {
    result = await runQuickSync({
      maxPages: payload.maxPages ?? 1,
      includeMovies: payload.includeMovies ?? true,
    });
  } else if (payload.type === 'full') {
    result = await runFullCatalogSync({
      category: payload.category,
      startPage: payload.startPage ?? 1,
      maxPages: payload.maxPages ?? 3,
      includeMovies: payload.includeMovies ?? true,
    });
  } else if (payload.type === 'detail') {
    result = await runDetailSync({
      batchSize: payload.batchSize ?? 10,
      slugs: payload.slugs || [],
    });
  } else {
    result = await runEpisodeSync({
      batchSize: payload.batchSize ?? 10,
      enrichEpisodes: payload.enrichEpisodes ?? false,
    });
  }

  sendSuccess(res, result, { status: 200, cached: false });
});
