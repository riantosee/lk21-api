import { z } from 'zod';

const optionalNonEmpty = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().min(1).max(120).optional()
);

const coerceInt = (min, max, fallback) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? fallback : Number(v)),
    z.number().int().min(min).max(max)
  );

const optionalYear = z.preprocess(
  (v) => (v === undefined || v === '' ? undefined : Number(v)),
  z.number().int().min(1888).max(2100).optional()
);

export const paginationQuerySchema = z.object({
  page: coerceInt(1, 1000, 1),
  limit: coerceInt(1, 100, 20),
});

export const latestQuerySchema = paginationQuerySchema.extend({
  type: z.enum(['movie', 'series']).optional(),
});

export const catalogFilterQuerySchema = paginationQuerySchema.extend({
  year: optionalYear,
  genre: optionalNonEmpty,
  country: optionalNonEmpty,
  status: z.enum(['ongoing', 'completed', 'released']).optional(),
  sort: z.enum(['latest', 'rating', 'year', 'title', 'updated']).default('latest'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const searchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1, 'Query parameter "q" is required').max(120),
  type: z.enum(['movie', 'series']).optional(),
  year: optionalYear,
  genre: optionalNonEmpty,
});

export const episodesQuerySchema = paginationQuerySchema.extend({
  season: z.preprocess(
    (v) => (v === undefined || v === '' ? undefined : Number(v)),
    z.number().int().min(0).max(200).optional()
  ),
});

export const slugParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9-]+$/i, 'Invalid slug format');

export const yearParamSchema = z.coerce.number().int().min(1888).max(2100);

export const scrapedContentSchema = z.object({
  source_id: z.string().nullable().optional(),
  source_slug: z.string().min(1),
  title: z.string().min(1),
  original_title: z.string().nullable().optional(),
  alternative_titles: z.array(z.string()).default([]),
  slug: z.string().min(1),
  content_type: z.enum(['movie', 'series']),
  poster_url: z.string().url().nullable().optional(),
  backdrop_url: z.string().url().nullable().optional(),
  synopsis: z.string().nullable().optional(),
  release_year: z.number().int().min(1888).max(2100).nullable().optional(),
  release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  rating: z.number().min(0).max(10).nullable().optional(),
  duration: z.string().nullable().optional(),
  quality: z.string().nullable().optional(),
  status: z.enum(['ongoing', 'completed', 'released', 'unknown']).nullable().optional(),
  region: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  director: z.string().nullable().optional(),
  cast: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  related_slugs: z.array(z.string()).default([]),
  is_featured: z.boolean().optional(),
  is_popular: z.boolean().optional(),
  is_recommended: z.boolean().optional(),
  total_seasons: z.number().int().min(0).nullable().optional(),
  total_episodes: z.number().int().min(0).nullable().optional(),
  detail_source_url: z.string().url(),
  source_updated_at: z.string().nullable().optional(),
  detail_scraped_at: z.string().nullable().optional(),
});

export const scrapedEpisodeSchema = z.object({
  season_number: z.number().int().min(0),
  episode_number: z.number().int().min(0),
  episode_title: z.string().nullable().optional(),
  episode_slug: z.string().min(1),
  thumbnail_url: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  source_url: z.string().url(),
});

export function validateQuery(schema, query) {
  const result = schema.safeParse(query || {});
  if (!result.success) {
    const err = new Error('Invalid request parameters');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    err.details = result.error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    throw err;
  }
  return result.data;
}
