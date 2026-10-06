// Run the conformance suite against one MetaMask version, in one mode, and
// write a JSON report of which actions pass, and the wallet profile of that
// MetaMask: what the dapp saw of it during the suite (scripts/profile.ts).
// Starts a local Anvil node (Foundry) for the tests that need a funded account.
//
//   npm run conformance -- [metamaskVersion] [--open]
//
// DAPPRESS_MODE picks where MetaMask shows the requests (see scripts/modes.ts):
// sidepanel (default), headless, or popup; mock replays a wallet profile,
// DAPPRESS_MOCK names it. --open opens the Cypress app on the suite, with the
// same wallet and the same Anvil node, and writes no report.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import cypress from 'cypress';
import { DEFAULTS } from '../src/config';
import { version as dappressVersion } from '../package.json';
import { MODES, MOCK_MODE, mockReportName, reportName } from './modes';
import type { Report } from './matrix';
import { buildProfile, readTrace } from './profile';
import { loadProfile } from '../src/wallet-profile';

const args = process.argv.slice(2);
const open = args.includes('--open');
const metamaskVersion = args.find((arg) => !arg.startsWith('--')) || process.env.DAPPRESS_METAMASK_VERSION || DEFAULTS.metamaskVersion;
const modeName = process.env.DAPPRESS_MODE || (process.env.DAPPRESS_HEADLESS === '1' ? 'headless' : 'sidepanel');
const mode = modeName === 'mock' ? MOCK_MODE : MODES[modeName];
if (!mode) {
  console.error(`[dappress] Unknown DAPPRESS_MODE "${modeName}": ${Object.keys(MODES).join(', ')}`);
  process.exit(1);
}
// In the mock mode, the wallet whose profile the mock replays: DAPPRESS_MOCK, a name or a profile's path
const mockWallet = modeName === 'mock' ? process.env.DAPPRESS_MOCK || 'metamask' : null;
const reportsDir = path.join(__dirname, '..', 'reports');
const ANVIL_URL = 'http://127.0.0.1:8545';

async function main(): Promise<void> {
  // A wallet nobody has used: MetaMask restores nothing for it, and Anvil funds it
  const wallet = newWallet();
  process.env.DAPPRESS_SEED_PHRASE = wallet.seedPhrase;
  // Read by conformance/cypress.config.ts, in the process Cypress starts for the plugins
  process.env.DAPPRESS_CONFORMANCE_CACHE = mode.cache ? '1' : '0';
  const traceFile = path.join(os.tmpdir(), `dappress-trace-${process.pid}.jsonl`);
  fs.rmSync(traceFile, { force: true });
  process.env.DAPPRESS_TRACE_FILE = traceFile;
  if (mockWallet) {
    // The mock's accounts are Anvil's, the wallet's own: it signs and sends for them
    process.env.DAPPRESS_MOCK = mockWallet;
    process.env.DAPPRESS_RPC_URL = ANVIL_URL;
  }
  // Read by conformance/cypress.config.ts: the wallet's accounts, for the tests to check against
  process.env.DAPPRESS_CONFORMANCE_WALLET = JSON.stringify({ accounts: wallet.accounts, imported: wallet.imported });
  const anvil = await startAnvil(wallet.seedPhrase);
  if (open) return openApp(anvil);
  let results;
  try {
    results = await cypress.run({
      project: path.join(__dirname, '..', 'conformance'),
      // Chrome for Testing, or a path to one: it loads MetaMask, and runs the mock as the other modes do
      browser: process.env.DAPPRESS_BROWSER || 'chrome-for-testing',
      headed: mode.headed,
      env: { DAPPRESS_METAMASK_VERSION: metamaskVersion },
    });
  } finally {
    anvil.kill();
  }
  // Cypress could not run: only then does the result have a status
  if ('status' in results) throw new Error(results.message);

  const actions = results.runs.flatMap((run) =>
    run.tests.map((test) => ({
      action: test.title.at(-1)!,
      status: test.state,
      error: test.displayError ? test.displayError.split('\n')[0] : undefined,
    })),
  );
  const report: Report = {
    dappressVersion,
    metamaskVersion,
    mode: modeName,
    browser: `${results.browserName} ${results.browserVersion}`,
    date: new Date().toISOString(),
    passed: actions.every((action) => action.status === 'passed'),
    actions,
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  let file = path.join(reportsDir, reportName(metamaskVersion, modeName));
  if (mockWallet) {
    const { name, version } = loadProfile(mockWallet).wallet;
    report.wallet = { name, version };
    file = path.join(reportsDir, mockReportName(name, version));
  }
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[dappress] Report written to ${file}`);
  for (const action of actions) console.log(`  ${action.status === 'passed' ? '✓' : '✗'} ${action.action}${action.error ? `: ${action.error}` : ''}`);

  if (!mockWallet) writeProfile(traceFile, report, wallet);
  process.exit(report.passed ? 0 : 1);
}

/**
 * The wallet profile of this MetaMask, from what the recorder caught during
 * the suite. The secrets of the run never go through the provider, and the
 * profile is checked for them all the same before it is written.
 */
function writeProfile(traceFile: string, report: Report, wallet: { seedPhrase: string; imported: { privateKey: string } }): void {
  if (!fs.existsSync(traceFile)) {
    console.warn('[dappress] No trace recorded: no profile written');
    return;
  }
  const profile = buildProfile(readTrace(traceFile), {
    wallet: { name: 'MetaMask', version: report.metamaskVersion },
    recorded: { by: `dappress ${report.dappressVersion}`, date: report.date, mode: modeName, browser: report.browser },
  });
  fs.rmSync(traceFile);
  const json = `${JSON.stringify(profile, null, 2)}\n`;
  for (const secret of [wallet.seedPhrase, wallet.imported.privateKey.replace(/^0x/, '')]) {
    if (json.toLowerCase().includes(secret.toLowerCase())) throw new Error('[dappress] The trace holds a secret of the run: no profile written');
  }
  const dir = path.join(reportsDir, 'profiles');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, reportName(report.metamaskVersion, modeName));
  fs.writeFileSync(file, json);
  const methods = Object.keys(profile.methods).length;
  const events = Object.keys(profile.events).length;
  console.log(`[dappress] Profile written to ${file}: ${methods} methods, ${events} events`);
}

// Foundry's cast: the seed phrase, its first two accounts, and a separate key
// to import. Its output is captured, so nothing secret reaches the logs.
function newWallet(): { seedPhrase: string; accounts: string[]; imported: { address: string; privateKey: string } } {
  const cast = (...args: string[]) => execFileSync(foundry('cast'), args, { encoding: 'utf8', stdio: 'pipe' });
  // Foundry's nightlies wrap cast's JSON in { data }, its 1.5 releases don't
  const castJson = (...args: string[]) => {
    const json = JSON.parse(cast(...args));
    return json.data ?? json;
  };
  const seedPhrase = castJson('wallet', 'new-mnemonic', '--words', '12', '--json').mnemonic;
  const account = (index: number) => cast('wallet', 'address', '--mnemonic', seedPhrase, '--mnemonic-index', String(index)).trim().toLowerCase();
  const [other] = castJson('wallet', 'new', '--json');
  return {
    seedPhrase,
    accounts: [account(0), account(1)],
    imported: { address: other.address.toLowerCase(), privateKey: other.private_key },
  };
}

/**
 * The Cypress app on the suite, in the browser the run would take, with the
 * wallet of this run. Anvil stays up until the app is closed.
 */
async function openApp(anvil: ChildProcess): Promise<void> {
  const browser = process.env.DAPPRESS_BROWSER || 'chrome-for-testing';
  const project = path.join(__dirname, '..', 'conformance');
  const app = spawn('npx', ['cypress', 'open', '--e2e', '--project', project, '--browser', browser, '--env', `DAPPRESS_METAMASK_VERSION=${metamaskVersion}`], {
    stdio: 'inherit',
  });
  // Closing the app, or Ctrl-C, stops Anvil with it
  const stop = () => {
    app.kill();
    anvil.kill();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const code = await new Promise<number>((resolve) => app.on('exit', (exitCode) => resolve(exitCode ?? 0)));
  anvil.kill();
  process.exit(code);
}

async function startAnvil(seedPhrase: string): Promise<ChildProcess> {
  // Another run's node would answer for this one, with other accounts
  if (await isUp(ANVIL_URL))
    throw new Error(`[dappress] Something already answers on ${ANVIL_URL}: another conformance run, or an Anvil of yours. Stop it first`);
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

function foundry(tool: string): string {
  const installed = path.join(os.homedir(), '.foundry', 'bin', tool);
  return fs.existsSync(installed) ? installed : tool;
}

async function isUp(url: string): Promise<boolean> {
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
