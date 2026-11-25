import { config } from '../../config/index.js';
import { listContents } from '../../database/contents.js';
import { createApiHandler } from '../../middleware/error-handler.js';
import { withCache } from '../../services/cache.js';
import { sendSuccess } from '../../utils/response.js';
import { validateQuery, paginationQuerySchema } from '../../utils/validator.js';

export default createApiHandler({ methods: ['GET'] }, async (req, res) => {
  const { limit } = validateQuery(paginationQuerySchema, { page: 1, limit: req.query?.limit ?? 12 });
  const sectionLimit = Math.min(24, limit);

  const { value, cached } = await withCache('home', `limit:${sectionLimit}`, config.cacheTtl.home, async () => {
    const [featured, latestMovies, latestSeries, popular, recommendations, ongoing, completed] = await Promise.all([
      listContents({ isFeatured: true, page: 1, limit: sectionLimit, sort: 'latest' }),
      listContents({ type: 'movie', page: 1, limit: sectionLimit, sort: 'latest' }),
      listContents({ type: 'series', page: 1, limit: sectionLimit, sort: 'latest' }),
      listContents({ isPopular: true, page: 1, limit: sectionLimit, sort: 'rating' }),
      listContents({ isRecommended: true, page: 1, limit: sectionLimit, sort: 'rating' }),
      listContents({ type: 'series', status: 'ongoing', page: 1, limit: sectionLimit, sort: 'latest' }),
      listContents({ type: 'series', status: 'completed', page: 1, limit: sectionLimit, sort: 'latest' }),
    ]);

    return {
      featured: { items: featured.items, total: featured.total, limit: sectionLimit },
      latest_movies: { items: latestMovies.items, total: latestMovies.total, limit: sectionLimit },
      latest_series: { items: latestSeries.items, total: latestSeries.total, limit: sectionLimit },
      popular: { items: popular.items, total: popular.total, limit: sectionLimit },
      recommendations: { items: recommendations.items, total: recommendations.total, limit: sectionLimit },
      ongoing: { items: ongoing.items, total: ongoing.total, limit: sectionLimit },
      completed: { items: completed.items, total: completed.total, limit: sectionLimit },
    };
  });

  sendSuccess(res, value, { cached });
});
