/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * CLI Entrypoint: npm run demo:reset [--dry-run]
 */

import './register';
import { resetDemoData } from './engine';

function parseArgs(args: string[]) {
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { dryRun };
}

async function main() {
  const { dryRun } = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log(' LokSwami B3 Demo Content Harness: RESET');
  console.log('============================================================');
  console.log(`Dry Run Mode: ${dryRun ? 'YES (No data will be removed)' : 'NO (Live removal of demo fixtures)'}`);
  console.log('------------------------------------------------------------');

  try {
    const result = await resetDemoData({ dryRun });

    console.log(`Store Active:              ${result.store.toUpperCase()}`);
    console.log(`Demo Articles Removed:     ${result.articlesRemoved}`);
    console.log(`Demo Videos Removed:       ${result.videosRemoved}`);
    console.log(`Demo E-Papers Removed:     ${result.epapersRemoved}`);
    console.log(`Demo EPaperStories Removed:${result.epaperArticlesRemoved}`);

    console.log('============================================================');
    console.log(`RESET COMPLETE: Scoped removal finished without touching production records.`);
    console.log('============================================================');
    process.exit(0);
  } catch (error) {
    console.error('============================================================');
    console.error('RESET FAILED:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('============================================================');
    process.exit(1);
  }
}

main();
