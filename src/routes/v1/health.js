import { checkDatabaseHealth } from '../../database/client.js';
import { getLatestSyncLog } from '../../database/jobs.js';
import { createApiHandler } from '../../middleware/error-handler.js';
import { checkCacheHealth } from '../../services/cache.js';
import { sendSuccess } from '../../utils/response.js';

export default createApiHandler({ methods: ['GET'], rateLimit: false }, async (_req, res) => {
  const [database, cache] = await Promise.all([checkDatabaseHealth(), checkCacheHealth()]);

  let lastSynchronization = null;
  if (database.healthy) {
    try {
      lastSynchronization = await getLatestSyncLog();
    } catch {
      lastSynchronization = null;
    }
  }

  const healthy = database.healthy;
  sendSuccess(
    res,
    {
      api: healthy ? 'ok' : 'degraded',
      database,
      cache,
      last_synchronization: lastSynchronization
        ? {
            id: lastSynchronization.id,
            sync_type: lastSynchronization.sync_type,
            status: lastSynchronization.status,
            started_at: lastSynchronization.started_at,
            completed_at: lastSynchronization.completed_at,
            total_discovered: lastSynchronization.total_discovered,
            total_inserted: lastSynchronization.total_inserted,
            total_updated: lastSynchronization.total_updated,
            total_failed: lastSynchronization.total_failed,
          }
        : null,
      server_timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, cached: false }
  );
});
