import { getDb } from './client.js';

export async function upsertSeasons(contentId, seasons) {
  if (!contentId || !seasons || seasons.length === 0) return [];
  const db = getDb();

  const rows = seasons.map((s) => ({
    content_id: contentId,
    season_number: s.season_number,
    season_title: s.season_title || `Season ${s.season_number}`,
    description: s.description || null,
    episode_count: s.episode_count ?? 0,
  }));

  const { data, error } = await db
    .from('seasons')
    .upsert(rows, { onConflict: 'content_id,season_number' })
    .select('*');

  if (error) throw new Error(`Failed to upsert seasons: ${error.message}`);
  return data || [];
}

export async function getSeasonsByContentId(contentId) {
  const db = getDb();
  const { data, error } = await db
    .from('seasons')
    .select('id, content_id, season_number, season_title, description, episode_count, created_at, updated_at')
    .eq('content_id', contentId)
    .order('season_number', { ascending: true });

  if (error) throw new Error(`Failed to fetch seasons: ${error.message}`);
  return data || [];
}
