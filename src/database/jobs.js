import { getDb } from './client.js';

export async function createScraperJob({ jobType, targetUrl, metadata = {} }) {
  const db = getDb();
  const { data, error } = await db
    .from('scraper_jobs')
    .insert({
      job_type: jobType,
      target_url: targetUrl,
      status: 'running',
      started_at: new Date().toISOString(),
      metadata,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create scraper job: ${error.message}`);
  return data;
}

export async function updateScraperJob(jobId, patch) {
  const db = getDb();
  const { data, error } = await db
    .from('scraper_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update scraper job: ${error.message}`);
  return data;
}

export async function listScraperJobs({ status, jobType, limit = 50 } = {}) {
  const db = getDb();
  let query = db.from('scraper_jobs').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) query = query.eq('status', status);
  if (jobType) query = query.eq('job_type', jobType);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to list scraper jobs: ${error.message}`);
  return data || [];
}

export async function getScraperJobById(id) {
  const db = getDb();
  const { data, error } = await db.from('scraper_jobs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to get scraper job: ${error.message}`);
  return data || null;
}

export async function createSyncLog(syncType, metadata = {}) {
  const db = getDb();
  const { data, error } = await db
    .from('sync_logs')
    .insert({
      sync_type: syncType,
      status: 'running',
      started_at: new Date().toISOString(),
      metadata,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create sync log: ${error.message}`);
  return data;
}

export async function finishSyncLog(logId, summary) {
  const db = getDb();
  const { data, error } = await db
    .from('sync_logs')
    .update({
      status: summary.status || 'completed',
      total_discovered: summary.total_discovered ?? 0,
      total_inserted: summary.total_inserted ?? 0,
      total_updated: summary.total_updated ?? 0,
      total_skipped: summary.total_skipped ?? 0,
      total_failed: summary.total_failed ?? 0,
      completed_at: new Date().toISOString(),
      metadata: summary.metadata || {},
    })
    .eq('id', logId)
    .select('*')
    .single();
  if (error) throw new Error(`Failed to finish sync log: ${error.message}`);
  return data;
}

export async function listSyncLogs(limit = 30) {
  const db = getDb();
  const { data, error } = await db
    .from('sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to list sync logs: ${error.message}`);
  return data || [];
}

export async function getLatestSyncLog() {
  const logs = await listSyncLogs(1);
  return logs[0] || null;
}

export async function isCrawlerPaused() {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('scraper_settings')
      .select('value')
      .eq('key', 'crawler_control')
      .maybeSingle();
    if (error || !data) return false;
    return Boolean(data.value?.paused);
  } catch {
    return false;
  }
}

export async function setCrawlerPaused(paused, updatedBy = 'admin') {
  const db = getDb();
  const value = { paused: Boolean(paused), updated_by: updatedBy, updated_at: new Date().toISOString() };
  const { data, error } = await db
    .from('scraper_settings')
    .upsert({ key: 'crawler_control', value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to update crawler control state: ${error.message}`);
  return data;
}
