import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * Concurrency-bounded batch processor with graceful pause/abort handling.
 */
export async function runBatchQueue(
  items,
  worker,
  { concurrency = config.scraper.concurrency, shouldStop, signal, onSuccess, onError } = {}
) {
  const queue = Array.from(items || []);
  const results = [];
  const errors = [];
  let index = 0;
  let stoppedEarly = false;

  const workerCount = Math.max(1, Math.min(concurrency, queue.length || 1));

  async function nextTask() {
    while (index < queue.length) {
      if (signal?.aborted || (shouldStop && (await shouldStop()))) {
        stoppedEarly = true;
        return;
      }

      const currentIdx = index;
      index += 1;
      const item = queue[currentIdx];

      try {
        const res = await worker(item, currentIdx);
        results.push({ item, result: res });
        if (onSuccess) await onSuccess(item, res);
      } catch (err) {
        logger.error({ index: currentIdx, err: err.message, code: err.code }, 'Queue item failed');
        errors.push({ item, error: err.message, code: err.code || 'QUEUE_ITEM_ERROR' });
        if (onError) await onError(item, err);
        if (err.code === 'ACCESS_PROTECTED' || err.code === 'ABORTED') {
          stoppedEarly = true;
          return;
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => nextTask()));

  return {
    total: queue.length,
    processed: results.length,
    failed: errors.length,
    stoppedEarly,
    results,
    errors,
  };
}
