// Run the conformance suite against one MetaMask version, in one mode, and
// write a JSON report of which actions pass. Starts a local Anvil node
// (Foundry) for the tests that need a funded account.
//
//   node scripts/conformance.js [metamaskVersion]
//
// DAPPRESS_MODE picks where MetaMask shows the requests (see scripts/modes.js):
// sidepanel (default), headless, or popup. DAPPRESS_HEADLESS=1 still means headless.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const cypress = require('cypress');
const { DEFAULTS } = require('../src/config');
const { version: dappressVersion } = require('../package.json');
const { MODES, reportName } = require('./modes');

const metamaskVersion = process.argv[2] || process.env.DAPPRESS_METAMASK_VERSION || DEFAULTS.metamaskVersion;
const modeName = process.env.DAPPRESS_MODE || (process.env.DAPPRESS_HEADLESS === '1' ? 'headless' : 'sidepanel');
const mode = MODES[modeName];
if (!mode) {
  console.error(`[dappress] Unknown DAPPRESS_MODE "${modeName}": ${Object.keys(MODES).join(', ')}`);
  process.exit(1);
}
const reportsDir = path.join(__dirname, '..', 'reports');
const ANVIL_URL = 'http://127.0.0.1:8545';

async function main() {
  // A wallet nobody has used: MetaMask restores nothing for it, and Anvil funds it
  const wallet = newWallet();
  process.env.DAPPRESS_SEED_PHRASE = wallet.seedPhrase;
  // Read by conformance/cypress.config.ts, in the process Cypress starts for the plugins
  process.env.DAPPRESS_CONFORMANCE_CACHE = mode.cache ? '1' : '0';
  const anvil = await startAnvil(wallet.seedPhrase);
  let results;
  try {
    results = await cypress.run({
      config: { expose: { conformance: { accounts: wallet.accounts, imported: wallet.imported } } },
      project: path.join(__dirname, '..', 'conformance'),
      // A browser that loads extensions: Chrome for Testing, or a path to one
      browser: process.env.DAPPRESS_BROWSER || 'chrome-for-testing',
      headed: mode.headed,
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
    mode: modeName,
    browser: `${results.browserName} ${results.browserVersion}`,
    date: new Date().toISOString(),
    passed: actions.every((action) => action.status === 'passed'),
    actions,
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, reportName(metamaskVersion, modeName));
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[dappress] Report written to ${file}`);
  for (const action of actions) console.log(`  ${action.status === 'passed' ? '✓' : '✗'} ${action.action}`);
  process.exit(report.passed ? 0 : 1);
}

// Foundry's cast: the seed phrase, its first two accounts, and a separate key
// to import. Its output is captured, so nothing secret reaches the logs.
function newWallet() {
  const cast = (...args) => execFileSync(foundry('cast'), args, { encoding: 'utf8', stdio: 'pipe' });
  // Foundry's nightlies wrap cast's JSON in { data }, its 1.5 releases don't
  const castJson = (...args) => {
    const json = JSON.parse(cast(...args));
    return json.data ?? json;
  };
  const seedPhrase = castJson('wallet', 'new-mnemonic', '--words', '12', '--json').mnemonic;
  const account = (index) => cast('wallet', 'address', '--mnemonic', seedPhrase, '--mnemonic-index', String(index)).trim().toLowerCase();
  const [other] = castJson('wallet', 'new', '--json');
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
