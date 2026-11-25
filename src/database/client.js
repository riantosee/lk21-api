import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config, isSupabaseConfigured } from '../config/index.js';

let clientInstance = null;

export class DatabaseUnavailableError extends Error {
  constructor(message = 'Database is not configured or unavailable') {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.statusCode = 503;
    this.code = 'DATABASE_UNAVAILABLE';
  }
}

export function getDb() {
  if (clientInstance) return clientInstance;
  if (!isSupabaseConfigured()) {
    throw new DatabaseUnavailableError('Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured');
  }
  const realtime = typeof globalThis.WebSocket === 'undefined' ? { transport: WebSocket } : undefined;
  clientInstance = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(realtime ? { realtime } : {}),
  });
  return clientInstance;
}

/** Testing hook to inject a mock or isolated Supabase client. */
export function setDbClient(customClient) {
  clientInstance = customClient;
}

export async function checkDatabaseHealth() {
  if (!clientInstance && !isSupabaseConfigured()) {
    return { status: 'unconfigured', healthy: false, latencyMs: null };
  }
  const started = Date.now();
  try {
    const db = getDb();
    const { error, statusText } = await db.from('contents').select('id').limit(1);
    if (error) {
      return { status: 'error', healthy: false, latencyMs: Date.now() - started, message: error.message || statusText || 'Database query failed' };
    }
    return { status: 'connected', healthy: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { status: 'error', healthy: false, latencyMs: Date.now() - started, message: err.message };
  }
}
