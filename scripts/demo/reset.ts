/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * CLI Entrypoint: npm run demo:reset [--dry-run]
 */

import './register';
import {
  DEMO_BREAKING_MODES,
  DEMO_CONTENT_SOURCES,
  resetDemoData,
  type DemoBreakingMode,
  type DemoContentSource,
} from './engine';

function parseArgs(args: string[]) {
  let dryRun = false;
  let source = 'synthetic';
  let breaking = 'snapshot';

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--source=')) {
      source = arg.slice('--source='.length).trim();
    } else if (arg.startsWith('--breaking=')) {
      breaking = arg.slice('--breaking='.length).trim();
    }
  }

  return { dryRun, source, breaking };
}

async function main() {
  const { dryRun, source, breaking } = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log(' LokSwami B3 Demo Content Harness: RESET');
  console.log('============================================================');
  console.log(`Dry Run Mode: ${dryRun ? 'YES (No data will be removed)' : 'NO (Live removal of demo fixtures)'}`);
  console.log(`Content Source: ${source}`);
  console.log(`Breaking Mode:  ${breaking} (does not narrow reset ownership)`);
  console.log('------------------------------------------------------------');

  try {
    const result = await resetDemoData({
      dryRun,
      source: source as DemoContentSource,
      breaking: breaking as DemoBreakingMode,
    });

    console.log(`Store Active:              ${result.store.toUpperCase()}`);
    console.log(`Source Active:             ${result.source.toUpperCase()}`);
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
    console.error('Supported sources:', DEMO_CONTENT_SOURCES.join(', '));
    console.error('Supported breaking modes:', DEMO_BREAKING_MODES.join(', '));
    console.error('============================================================');
    process.exit(1);
  }
}

main();
