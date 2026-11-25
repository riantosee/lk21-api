import { getDb } from './client.js';

export async function upsertEpisodes(contentId, seasonRows, episodes) {
  if (!contentId || !episodes || episodes.length === 0) return [];
  const db = getDb();

  const seasonIdByNumber = new Map((seasonRows || []).map((s) => [s.season_number, s.id]));
  const now = new Date().toISOString();

  const deduped = new Map();
  for (const ep of episodes) {
    const seasonId = seasonIdByNumber.get(ep.season_number);
    if (!seasonId) continue;
    deduped.set(ep.source_url, {
      content_id: contentId,
      season_id: seasonId,
      episode_number: ep.episode_number,
      episode_title: ep.episode_title || null,
      episode_slug: ep.episode_slug,
      thumbnail_url: ep.thumbnail_url || null,
      description: ep.description || null,
      release_date: ep.release_date || null,
      source_url: ep.source_url,
      scraped_at: now,
    });
  }

  const rows = Array.from(deduped.values());
  if (rows.length === 0) return [];

  const { data, error } = await db
    .from('episodes')
    .upsert(rows, { onConflict: 'source_url' })
    .select('*');

  if (error) throw new Error(`Failed to upsert episodes: ${error.message}`);
  return data || [];
}

export async function getEpisodesByContentId(contentId, { season, page = 1, limit = 50 } = {}) {
  const db = getDb();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let seasonId = null;
  if (season !== undefined && season !== null) {
    const { data: seasonRow, error: sErr } = await db
      .from('seasons')
      .select('id, season_number')
      .eq('content_id', contentId)
      .eq('season_number', season)
      .maybeSingle();
    if (sErr) throw new Error(`Failed to resolve season filter: ${sErr.message}`);
    if (!seasonRow) return { items: [], total: 0 };
    seasonId = seasonRow.id;
  }

  let query = db
    .from('episodes')
    .select(
      'id, content_id, season_id, episode_number, episode_title, episode_slug, thumbnail_url, description, release_date, source_url, scraped_at, seasons(season_number, season_title)',
      { count: 'exact' }
    )
    .eq('content_id', contentId);

  if (seasonId) query = query.eq('season_id', seasonId);

  query = query
    .order('episode_number', { ascending: true })
    .range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to fetch episodes: ${error.message}`);

  const items = (data || []).map((row) => ({
    id: row.id,
    content_id: row.content_id,
    season_id: row.season_id,
    season_number: row.seasons?.season_number ?? null,
    season_title: row.seasons?.season_title ?? null,
    episode_number: row.episode_number,
    episode_title: row.episode_title,
    episode_slug: row.episode_slug,
    thumbnail_url: row.thumbnail_url,
    description: row.description,
    release_date: row.release_date,
    source_url: row.source_url,
    scraped_at: row.scraped_at,
  }));

  return { items, total: count || 0 };
}
