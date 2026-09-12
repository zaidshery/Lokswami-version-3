/**
 * LokSwami B3 Local Demo Content & QA Fixture Harness
 * CLI Entrypoint: npm run demo:verify [--scenario=<name>]
 */

import './register';
import { verifyDemoData } from './engine';
import { SUPPORTED_SCENARIOS } from './scenarios';

function parseArgs(args: string[]) {
  let scenario = 'full';

  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      scenario = arg.slice('--scenario='.length).trim();
    }
  }

  return { scenario };
}

async function main() {
  const { scenario } = parseArgs(process.argv.slice(2));

  console.log('============================================================');
  console.log(' LokSwami B3 Demo Content Harness: VERIFY');
  console.log('============================================================');
  console.log(`Verifying Scenario: ${scenario}`);
  console.log('------------------------------------------------------------');

  try {
    const result = await verifyDemoData(scenario);

    console.log(`Store Active:     ${result.store.toUpperCase()}`);
    console.log(`Total Checks:     ${result.checks.length}`);
    console.log(`Passed:           ${result.totalPassed}`);
    console.log(`Failed:           ${result.totalFailed}`);
    console.log(`Skipped:          ${result.totalSkipped}`);
    console.log('------------------------------------------------------------');
    console.log('Verification Details:');

    for (const check of result.checks) {
      const tag =
        check.status === 'passed'
          ? '[PASS]'
          : check.status === 'skipped'
            ? '[SKIP]'
            : '[FAIL]';
      console.log(`  ${tag.padEnd(7)} ${check.name}`);
      if (check.details) {
        console.log(`          ${check.details}`);
      }
    }

    console.log('============================================================');
    if (result.ok) {
      console.log(`VERIFICATION PASSED: All reader-visible invariant checks passed.`);
      console.log('============================================================');
      process.exit(0);
    } else {
      console.error(`VERIFICATION FAILED: ${result.totalFailed} invariant check(s) failed.`);
      console.error('============================================================');
      process.exit(1);
    }
  } catch (error) {
    console.error('============================================================');
    console.error('VERIFICATION ERROR:');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Supported scenarios:', SUPPORTED_SCENARIOS.join(', '));
    console.error('============================================================');
    process.exit(1);
  }
}

main();
