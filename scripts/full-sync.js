import { runDetailSync, runFullCatalogSync } from '../src/services/sync.js';
import { logger } from '../src/utils/logger.js';

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const [key, val] = token.slice(2).split('=');
      args[key] = val ?? argv[i + 1] ?? true;
      if (val === undefined && argv[i + 1] && !argv[i + 1].startsWith('--')) i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const category = typeof args.category === 'string' ? args.category : undefined;
  const startPage = Number.parseInt(args['start-page'] || '1', 10) || 1;
  const maxPages = Number.parseInt(args['max-pages'] || '5', 10) || 5;
  const includeDetails = Boolean(args.details);

  const catalogResult = await runFullCatalogSync({
    category,
    startPage,
    maxPages,
    includeMovies: args['no-movies'] ? false : true,
    signal: controller.signal,
  });

  let detailResult = null;
  if (includeDetails && !controller.signal.aborted) {
    const batchSize = Number.parseInt(args['detail-batch'] || '20', 10) || 20;
    detailResult = await runDetailSync({ batchSize, signal: controller.signal });
  }

  const output = { catalog: catalogResult, detail: detailResult };
  logger.info({ status: catalogResult.status }, 'Full sync batch finished');
  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  logger.error({ err: err.message }, 'Full sync failed');
  process.exit(1);
});
