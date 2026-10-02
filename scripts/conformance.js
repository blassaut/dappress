// Run the conformance suite against one MetaMask version and write a JSON
// report of which actions pass. Starts a local Anvil node (Foundry) for the
// tests that need a funded account.
//
//   node scripts/conformance.js [metamaskVersion]

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const cypress = require('cypress');
const { DEFAULTS } = require('../src/config');
const { version: dappressVersion } = require('../package.json');

const metamaskVersion = process.argv[2] || process.env.DAPPRESS_METAMASK_VERSION || DEFAULTS.metamaskVersion;
const reportsDir = path.join(__dirname, '..', 'reports');
const ANVIL_URL = 'http://127.0.0.1:8545';

async function main() {
  // A wallet nobody has used: MetaMask restores nothing for it, and Anvil funds it
  const wallet = newWallet();
  process.env.DAPPRESS_SEED_PHRASE = wallet.seedPhrase;
  const anvil = await startAnvil(wallet.seedPhrase);
  let results;
  try {
    results = await cypress.run({
      config: { expose: { conformance: { accounts: wallet.accounts, imported: wallet.imported } } },
      project: path.join(__dirname, '..', 'conformance'),
      // A browser that loads extensions: Chrome for Testing, or a path to one
      browser: process.env.DAPPRESS_BROWSER || 'chrome-for-testing',
      // With a window, unless DAPPRESS_HEADLESS=1
      headed: process.env.DAPPRESS_HEADLESS !== '1',
      env: { DAPPRESS_METAMASK_VERSION: metamaskVersion },
    });
  } finally {
    anvil.kill();
  }
  if (results.status === 'failed') throw new Error(results.message);

  const actions = results.runs.flatMap((run) =>
    run.tests.map((test) => ({
      action: test.title.at(-1),
      status: test.state,
      error: test.displayError ? test.displayError.split('\n')[0] : undefined,
    })),
  );
  const report = {
    dappressVersion,
    metamaskVersion,
    browser: `${results.browserName} ${results.browserVersion}`,
    date: new Date().toISOString(),
    passed: actions.every((action) => action.status === 'passed'),
    actions,
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, `metamask-${metamaskVersion}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[dappress] Report written to ${file}`);
  for (const action of actions) console.log(`  ${action.status === 'passed' ? '✓' : '✗'} ${action.action}`);
  process.exit(report.passed ? 0 : 1);
}

// Foundry's cast: the seed phrase, its first two accounts, and a separate key
// to import. Its output is captured, so nothing secret reaches the logs.
function newWallet() {
  const cast = (...args) => execFileSync(foundry('cast'), args, { encoding: 'utf8', stdio: 'pipe' });
  const seedPhrase = JSON.parse(cast('wallet', 'new-mnemonic', '--words', '12', '--json')).data.mnemonic;
  const account = (index) => cast('wallet', 'address', '--mnemonic', seedPhrase, '--mnemonic-index', String(index)).trim().toLowerCase();
  const [other] = JSON.parse(cast('wallet', 'new', '--json')).data;
  return {
    seedPhrase,
    accounts: [account(0), account(1)],
    imported: { address: other.address.toLowerCase(), privateKey: other.private_key },
  };
}

async function startAnvil(seedPhrase) {
  const anvil = spawn(foundry('anvil'), ['--silent', '--mnemonic', seedPhrase], { stdio: 'inherit' });
  anvil.on('error', () => {
    console.error('[dappress] Anvil is needed for the funded transaction tests: https://getfoundry.sh');
    process.exit(1);
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await isUp(ANVIL_URL)) return anvil;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  anvil.kill();
  throw new Error(`[dappress] Anvil did not answer on ${ANVIL_URL}`);
}

function foundry(tool) {
  const installed = path.join(os.homedir(), '.foundry', 'bin', tool);
  return fs.existsSync(installed) ? installed : tool;
}

async function isUp(url) {
  try {
    const response = await fetch(url, { method: 'POST', body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' });
    return response.ok;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
