import { isCrawlerPaused, listScraperJobs, listSyncLogs } from '../../../database/jobs.js';
import { createApiHandler } from '../../../middleware/error-handler.js';
import { sendSuccess } from '../../../utils/response.js';

export default createApiHandler({ methods: ['GET'], auth: 'admin' }, async (_req, res) => {
  const [paused, runningJobs, failedJobs, recentSyncs] = await Promise.all([
    isCrawlerPaused(),
    listScraperJobs({ status: 'running', limit: 20 }),
    listScraperJobs({ status: 'failed', limit: 20 }),
    listSyncLogs(10),
  ]);

  sendSuccess(
    res,
    {
      paused,
      active_jobs: runningJobs.length,
      failed_jobs_count: failedJobs.length,
      running: runningJobs,
      recent_syncs: recentSyncs,
    },
    { cached: false }
  );
});
