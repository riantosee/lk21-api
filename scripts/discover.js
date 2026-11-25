import { scrapeHomepage } from '../src/scraper/homepage.js';
import { scrapeLatestSeries, scrapeRecommendedSeries } from '../src/scraper/series.js';
import { scrapeLatestMovies } from '../src/scraper/movies.js';
import { scrapeDetail } from '../src/scraper/detail.js';
import { scrapeSourceSearch } from '../src/scraper/search.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  logger.info('Starting live source discovery & parser verification...');

  const home = await scrapeHomepage();
  console.log('\n[HOMEPAGE]');
  console.log({
    sourceUrl: home.sourceUrl,
    featured: home.sections.featured.length,
    latest_series: home.sections.latest_series.length,
    latest_movies: home.sections.latest_movies.length,
    popular: home.sections.popular.length,
    recommendations: home.sections.recommendations.length,
    genres: home.taxonomy.genres.length,
    countries: home.taxonomy.countries.length,
    years: home.taxonomy.years.length,
    totalUniqueItems: home.allItems.length,
  });

  const latestSeries = await scrapeLatestSeries({ maxPages: 2 });
  console.log('\n[LATEST SERIES (2 pages)]');
  console.log({
    pagesProcessed: latestSeries.pagesProcessed,
    totalPages: latestSeries.totalPages,
    items: latestSeries.items.length,
    hasMore: latestSeries.hasMore,
    sample: latestSeries.items[0],
  });

  const latestMovies = await scrapeLatestMovies({ maxPages: 1 });
  console.log('\n[LATEST MOVIES (1 page)]');
  console.log({
    pagesProcessed: latestMovies.pagesProcessed,
    totalPages: latestMovies.totalPages,
    items: latestMovies.items.length,
    sample: latestMovies.items[0],
  });

  const recs = await scrapeRecommendedSeries();
  console.log('\n[RECOMMENDATIONS AJAX]');
  console.log({ items: recs.items.length, sampleTitle: recs.items[0]?.title });

  const sampleSeriesUrl = home.sections.featured[0]?.detail_source_url || latestSeries.items[0]?.detail_source_url;
  if (sampleSeriesUrl) {
    const detail = await scrapeDetail(sampleSeriesUrl);
    console.log('\n[SERIES DETAIL]');
    console.log({
      title: detail.content.title,
      source_id: detail.content.source_id,
      slug: detail.content.slug,
      year: detail.content.release_year,
      release_date: detail.content.release_date,
      rating: detail.content.rating,
      status: detail.content.status,
      region: detail.content.region,
      country: detail.content.country,
      director: detail.content.director,
      castCount: detail.content.cast.length,
      genres: detail.content.genres,
      seasons: detail.seasons.length,
      episodes: detail.episodes.length,
      relatedCount: detail.related.length,
      synopsisPreview: detail.content.synopsis?.slice(0, 100),
    });
  }

  const sampleMovieUrl = latestMovies.items[0]?.detail_source_url;
  if (sampleMovieUrl) {
    const movieDetail = await scrapeDetail(sampleMovieUrl);
    console.log('\n[MOVIE DETAIL]');
    console.log({
      title: movieDetail.content.title,
      source_id: movieDetail.content.source_id,
      content_type: movieDetail.content.content_type,
      quality: movieDetail.content.quality,
      duration: movieDetail.content.duration,
      release_date: movieDetail.content.release_date,
      country: movieDetail.content.country,
      director: movieDetail.content.director,
      castCount: movieDetail.content.cast.length,
      genres: movieDetail.content.genres,
    });
  }

  const search = await scrapeSourceSearch('empress', { page: 1 });
  console.log('\n[SOURCE SEARCH "empress"]');
  console.log({ totalPages: search.totalPages, items: search.items.length, sample: search.items[0]?.title });
}

main().catch((err) => {
  logger.error({ err: err.message, code: err.code }, 'Discovery script failed');
  process.exit(1);
});
