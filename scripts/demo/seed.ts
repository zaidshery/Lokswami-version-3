/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * CLI Entrypoint: npm run demo:seed [--scenario=<name>] [--dry-run]
 */

import './register';
import {
  DEMO_BREAKING_MODES,
  DEMO_CONTENT_SOURCES,
  seedScenario,
  type DemoBreakingMode,
  type DemoContentSource,
} from './engine';
import { SUPPORTED_SCENARIOS } from './scenarios';

function parseArgs(args: string[]) {
  let scenario = 'full';
  let dryRun = false;
  let source = 'synthetic';
  let breaking = 'snapshot';

  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--scenario=')) {
      scenario = arg.slice('--scenario='.length).trim();
    } else if (arg.startsWith('--source=')) {
      source = arg.slice('--source='.length).trim();
    } else if (arg.startsWith('--breaking=')) {
      breaking = arg.slice('--breaking='.length).trim();
    }
  }

  return { scenario, dryRun, source, breaking };
}

async function main() {
  const { scenario, dryRun, source, breaking } = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log(' LokSwami B3 Demo Content Harness: SEED');
  console.log('============================================================');
  console.log(`Requested Scenario: ${scenario}`);
  console.log(`Content Source:     ${source}`);
  console.log(`Breaking Mode:      ${breaking}`);
  console.log(`Dry Run Mode:       ${dryRun ? 'YES (No changes will be written)' : 'NO (Live seed)'}`);
  console.log('------------------------------------------------------------');

  try {
    const result = await seedScenario(scenario, {
      dryRun,
      source: source as DemoContentSource,
      breaking: breaking as DemoBreakingMode,
    });

    console.log(`Store Selected:     ${result.store.toUpperCase()}`);
    console.log(`Source Selected:    ${result.source.toUpperCase()}`);
    console.log(`Real Content:       ${result.composition.realPercent}% (${result.composition.real}/${result.composition.total})`);
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
    console.error('Supported sources:', DEMO_CONTENT_SOURCES.join(', '));
    console.error('Supported breaking modes:', DEMO_BREAKING_MODES.join(', '));
    console.error('============================================================');
    process.exit(1);
  }
}

main();
