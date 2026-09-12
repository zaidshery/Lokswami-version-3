/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * CLI Entrypoint: npm run demo:seed [--scenario=<name>] [--dry-run]
 */

import './register';
import { seedScenario } from './engine';
import { SUPPORTED_SCENARIOS } from './scenarios';

function parseArgs(args: string[]) {
  let scenario = 'full';
  let dryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--scenario=')) {
      scenario = arg.slice('--scenario='.length).trim();
    }
  }

  return { scenario, dryRun };
}

async function main() {
  const { scenario, dryRun } = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log(' LokSwami B3 Demo Content Harness: SEED');
  console.log('============================================================');
  console.log(`Requested Scenario: ${scenario}`);
  console.log(`Dry Run Mode:       ${dryRun ? 'YES (No changes will be written)' : 'NO (Live seed)'}`);
  console.log('------------------------------------------------------------');

  try {
    const result = await seedScenario(scenario, { dryRun });

    console.log(`Store Selected:     ${result.store.toUpperCase()}`);
    console.log(`Articles Seeded:    ${result.articlesSeeded}`);
    console.log(`Videos Seeded:      ${result.videosSeeded}`);
    console.log(`Shorts Seeded:      ${result.shortsSeeded}`);
    console.log(`E-Papers Seeded:    ${result.epapersSeeded}`);
    console.log(`Magazines Seeded:   ${result.magazinesSeeded}`);

    if (result.skipped.length > 0) {
      console.log('------------------------------------------------------------');
      console.log('Capability Limitations / Skips:');
      for (const msg of result.skipped) {
        console.log(`  - ${msg}`);
      }
    }

    console.log('============================================================');
    console.log(`SEED SUCCESSFUL: Scenario "${scenario}" seeded successfully.`);
    console.log('Next step: run "npm run demo:verify" to validate reader visibility.');
    console.log('============================================================');
    process.exit(0);
  } catch (error) {
    console.error('============================================================');
    console.error('SEED FAILED:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Supported scenarios:', SUPPORTED_SCENARIOS.join(', '));
    console.error('============================================================');
    process.exit(1);
  }
}

main();
