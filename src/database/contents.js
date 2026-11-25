import { getDb } from './client.js';
import { deduplicateContents, mergeContentRecords, slugify } from '../services/normalization.js';

const SORT_COLUMN_MAP = {
  latest: 'scraped_at',
  updated: 'updated_at',
  rating: 'rating',
  year: 'release_year',
  title: 'title',
};

const CONTENT_SUMMARY_COLUMNS =
  'id, source_id, source_slug, title, original_title, slug, content_type, poster_url, backdrop_url, release_year, release_date, rating, duration, quality, status, region, country, genres, total_seasons, total_episodes, is_featured, is_popular, is_recommended, detail_source_url, scraped_at, updated_at';

function resolveGenreName(slugOrName) {
  if (!slugOrName) return null;
  const trimmed = String(slugOrName).trim();
  if (trimmed.includes(' ') || /[A-Z]/.test(trimmed)) return trimmed;
  if (trimmed.toLowerCase() === 'sci-fi') return 'Sci-Fi';
  if (trimmed.toLowerCase() === 'tv-movie') return 'TV Movie';
  if (trimmed.toLowerCase() === 'film-noir') return 'Film-Noir';
  return trimmed
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function applyCommonFilters(query, filters) {
  if (filters.type) query = query.eq('content_type', filters.type);
  if (filters.year) query = query.eq('release_year', filters.year);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.region) query = query.ilike('region', filters.region);
  if (filters.country) {
    const normalized = filters.country.replace(/-/g, ' ');
    query = query.ilike('country', `%${normalized}%`);
  }
  if (filters.genre) {
    const genreLabel = resolveGenreName(filters.genre);
    query = query.contains('genres', [genreLabel]);
  }
  if (filters.isFeatured) query = query.eq('is_featured', true);
  if (filters.isPopular) query = query.eq('is_popular', true);
  if (filters.isRecommended) query = query.eq('is_recommended', true);
  return query;
}

/**
 * Non-destructive batch upsert: fetches existing records first and merges
 * incoming non-null values so catalog syncs never erase detail metadata.
 */
export async function upsertContents(rawRecords) {
  const deduped = deduplicateContents(rawRecords || []);
  if (deduped.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0, records: [] };
  }

  const db = getDb();
  const urls = deduped.map((r) => r.detail_source_url).filter(Boolean);
  const slugs = deduped.map((r) => r.slug).filter(Boolean);

  const [{ data: existingByUrl, error: err1 }, { data: existingBySlug, error: err2 }] = await Promise.all([
    urls.length ? db.from('contents').select('*').in('detail_source_url', urls) : { data: [], error: null },
    slugs.length ? db.from('contents').select('*').in('slug', slugs) : { data: [], error: null },
  ]);

  if (err1) throw new Error(`Failed to lookup existing contents by URL: ${err1.message}`);
  if (err2) throw new Error(`Failed to lookup existing contents by slug: ${err2.message}`);

  const existingMap = new Map();
  for (const row of [...(existingByUrl || []), ...(existingBySlug || [])]) {
    if (row.detail_source_url) existingMap.set(`url:${row.detail_source_url.toLowerCase()}`, row);
    if (row.slug) existingMap.set(`slug:${row.slug.toLowerCase()}`, row);
  }

  let inserted = 0;
  let updated = 0;
  const now = new Date().toISOString();
  const payload = [];

  for (const item of deduped) {
    const existing =
      existingMap.get(`url:${item.detail_source_url.toLowerCase()}`) ||
      existingMap.get(`slug:${item.slug.toLowerCase()}`);

    if (existing) {
      updated += 1;
      const merged = mergeContentRecords(existing, item);
      // Match existing row via onConflict: detail_source_url without sending `id` in mixed batches
      merged.detail_source_url = existing.detail_source_url;
      merged.is_featured = Boolean(merged.is_featured);
      merged.is_popular = Boolean(merged.is_popular);
      merged.is_recommended = Boolean(merged.is_recommended);
      merged.scraped_at = now;
      delete merged.id;
      delete merged.created_at;
      delete merged.updated_at;
      payload.push(merged);
    } else {
      inserted += 1;
      const next = {
        ...item,
        is_featured: Boolean(item.is_featured),
        is_popular: Boolean(item.is_popular),
        is_recommended: Boolean(item.is_recommended),
        scraped_at: now,
      };
      delete next.id;
      payload.push(next);
    }
  }

  const { data, error } = await db
    .from('contents')
    .upsert(payload, { onConflict: 'detail_source_url' })
    .select('*');

  if (error) {
    throw new Error(`Failed to upsert contents: ${error.message}`);
  }

  return {
    inserted,
    updated,
    skipped: rawRecords.length - deduped.length,
    records: data || [],
  };
}

export async function listContents(filters = {}) {
  const db = getDb();
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const sortCol = SORT_COLUMN_MAP[filters.sort] || 'scraped_at';
  const ascending = filters.order === 'asc';

  let query = db.from('contents').select(CONTENT_SUMMARY_COLUMNS, { count: 'exact' });
  query = applyCommonFilters(query, filters);
  query = query
    .order(sortCol, { ascending, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to list contents: ${error.message}`);
  return { items: data || [], total: count || 0 };
}

export async function searchContents({ q, type, year, genre, page = 1, limit = 20 }) {
  const db = getDb();
  const safeTerm = String(q || '').trim().replace(/[%_,]/g, '');
  if (!safeTerm) return { items: [], total: 0 };

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const pattern = `%${safeTerm}%`;

  let query = db
    .from('contents')
    .select(CONTENT_SUMMARY_COLUMNS, { count: 'exact' })
    .or(`title.ilike.${pattern},original_title.ilike.${pattern},slug.ilike.${pattern}`);

  query = applyCommonFilters(query, { type, year, genre });
  query = query
    .order('rating', { ascending: false, nullsFirst: false })
    .order('release_year', { ascending: false, nullsFirst: false })
    .range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to search contents: ${error.message}`);
  return { items: data || [], total: count || 0 };
}

export async function getContentBySlug(slug) {
  const db = getDb();
  const normalized = slugify(slug);
  const { data, error } = await db
    .from('contents')
    .select('*')
    .or(`slug.eq.${normalized},source_slug.eq.${normalized}`)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to get content by slug: ${error.message}`);
  return data || null;
}

export async function getRelatedContents(content, limit = 10) {
  const db = getDb();
  const relatedSlugs = Array.isArray(content.related_slugs) ? content.related_slugs : [];
  if (relatedSlugs.length > 0) {
    const { data } = await db
      .from('contents')
      .select(CONTENT_SUMMARY_COLUMNS)
      .in('slug', relatedSlugs.slice(0, limit))
      .neq('id', content.id)
      .limit(limit);
    if (data && data.length > 0) return data;
  }

  // Fallback: same content_type & first genre
  const primaryGenre = Array.isArray(content.genres) && content.genres[0];
  let query = db
    .from('contents')
    .select(CONTENT_SUMMARY_COLUMNS)
    .eq('content_type', content.content_type)
    .neq('id', content.id);
  if (primaryGenre) query = query.contains('genres', [primaryGenre]);
  const { data } = await query.order('rating', { ascending: false, nullsFirst: false }).limit(limit);
  return data || [];
}

export async function getPendingDetailContents(limit = 20) {
  const db = getDb();
  const { data, error } = await db
    .from('contents')
    .select('id, slug, source_slug, content_type, detail_source_url, detail_scraped_at')
    .order('detail_scraped_at', { ascending: true, nullsFirst: true })
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to query detail sync queue: ${error.message}`);
  return data || [];
}

export async function getSeriesForEpisodeSync(limit = 20) {
  const db = getDb();
  const { data, error } = await db
    .from('contents')
    .select('id, slug, source_slug, title, status, detail_source_url, detail_scraped_at')
    .eq('content_type', 'series')
    .order('status', { ascending: false, nullsFirst: false }) // 'ongoing' before 'completed'
    .order('detail_scraped_at', { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`Failed to query series episode queue: ${error.message}`);
  return data || [];
}

export async function listYears() {
  const db = getDb();
  const { data, error } = await db
    .from('contents')
    .select('release_year')
    .not('release_year', 'is', null)
    .order('release_year', { ascending: false });

  if (error) throw new Error(`Failed to list years: ${error.message}`);
  const counts = new Map();
  for (const row of data || []) {
    counts.set(row.release_year, (counts.get(row.release_year) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, count]) => ({ year, count }));
}

export async function upsertGenres(genres) {
  if (!genres || genres.length === 0) return [];
  const db = getDb();
  const unique = Array.from(new Map(genres.map((g) => [g.slug, g])).values());
  const { data, error } = await db.from('genres').upsert(unique, { onConflict: 'slug' }).select('*');
  if (error) throw new Error(`Failed to upsert genres: ${error.message}`);
  return data || [];
}

export async function listGenres() {
  const db = getDb();
  const { data, error } = await db.from('genres').select('id, name, slug, source_url').order('name', { ascending: true });
  if (error) throw new Error(`Failed to list genres: ${error.message}`);
  return data || [];
}

export async function getGenreBySlug(slug) {
  const db = getDb();
  const { data, error } = await db.from('genres').select('*').eq('slug', slugify(slug)).maybeSingle();
  if (error) throw new Error(`Failed to get genre: ${error.message}`);
  return data || null;
}

export async function upsertCountries(countries) {
  if (!countries || countries.length === 0) return [];
  const db = getDb();
  const unique = Array.from(new Map(countries.map((c) => [c.slug, c])).values());
  const { data, error } = await db.from('countries').upsert(unique, { onConflict: 'slug' }).select('*');
  if (error) throw new Error(`Failed to upsert countries: ${error.message}`);
  return data || [];
}

export async function listCountries() {
  const db = getDb();
  const { data, error } = await db.from('countries').select('id, name, slug, source_url').order('name', { ascending: true });
  if (error) throw new Error(`Failed to list countries: ${error.message}`);
  return data || [];
}

export async function getCountryBySlug(slug) {
  const db = getDb();
  const { data, error } = await db.from('countries').select('*').eq('slug', slugify(slug)).maybeSingle();
  if (error) throw new Error(`Failed to get country: ${error.message}`);
  return data || null;
}
