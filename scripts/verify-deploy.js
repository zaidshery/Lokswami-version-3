const path = require('path');
const { spawn } = require('child_process');

function parseArgs(argv) {
  let help = false;
  const passthroughArgs = [];

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }

    passthroughArgs.push(arg);
  }

  return { help, passthroughArgs };
}

function runScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${path.basename(scriptPath)} exited with status ${String(code ?? 'unknown')}`
        )
      );
    });
  });
}

async function main() {
  const { help, passthroughArgs } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log('Usage: npm run verify:deploy -- https://your-domain.com');
    console.log(
      '   or: npm run verify:deploy -- --baseUrl=https://your-domain.com --timeoutMs=20000'
    );
    return;
  }

  const smokeScript = path.join(__dirname, 'smoke-check-deploy.js');
  const seoSmokeScript = path.join(__dirname, 'seo-smoke-check.js');
  const adminRuntimeScript = path.join(__dirname, 'test-admin-runtime.js');

  console.log('Running deploy smoke checks...');
  await runScript(smokeScript, passthroughArgs);

  console.log('\nRunning SEO smoke checks...');
  await runScript(seoSmokeScript, passthroughArgs);

  console.log('\nRunning admin runtime guest-boundary checks...');
  await runScript(adminRuntimeScript, passthroughArgs);

  console.log('\nDeploy verification passed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Deploy verification failed: ${message}`);
  process.exit(1);
});
