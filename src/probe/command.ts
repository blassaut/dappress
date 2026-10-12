// `dappress probe`: Anvil and the probe page, for as long as the command runs.
// The page records the profile of the wallet installed in the browser that
// opens it, and downloads it: the command writes nothing.

import fs from 'node:fs';
import path from 'node:path';
import { startAnvil, ANVIL_PORT, type Anvil } from './anvil';
import { startProbeServer, type ProbeServer, type ProbeServerOptions } from './server';
import { loadProfile } from '../wallet-profile';

export const USAGE = `Usage: dappress probe [--anvil-port <port>]

Records the profile of a wallet: what a dapp sees of it, request by request.
Starts Anvil and a page on this machine; open the page in the browser where
the wallet is installed, and follow it. Needs Anvil, part of Foundry (getfoundry.sh).

  --anvil-port <port>   The port Anvil listens on (${ANVIL_PORT})`;

export type Parsed = { command: 'probe'; anvilPort: number } | { error: string };

export function parseArgs(args: string[]): Parsed {
  const [command, ...rest] = args;
  if (!command) return { error: USAGE };
  if (command !== 'probe') return { error: `Unknown command "${command}".\n\n${USAGE}` };
  let anvilPort = ANVIL_PORT;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] !== '--anvil-port') return { error: `Unknown option "${rest[i]}".\n\n${USAGE}` };
    const value = rest[++i];
    if (!/^\d+$/.test(value ?? '') || Number(value) < 1 || Number(value) > 65535)
      return { error: `--anvil-port takes a port number, not "${value ?? ''}".\n\n${USAGE}` };
    anvilPort = Number(value);
  }
  return { command: 'probe', anvilPort };
}

export interface CliDeps {
  startAnvil(options: { port: number }): Promise<Anvil>;
  startServer(options: Pick<ProbeServerOptions, 'anvilUrl'>): Promise<ProbeServer>;
  log(line: string): void;
  error(line: string): void;
  /** Run `handler` when the command is asked to stop: Ctrl+C, or a signal. */
  onStop(handler: () => void): void;
  /** Run `handler` when the process ends, whatever the reason: an uncaught exception included. */
  onExit(handler: () => void): void;
}

// The built page sits next to this file in dist/probe; the package's root two levels up
const PAGE_ROOT = __dirname;
const dappressVersion = () => (JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { version: string }).version;

export const defaultDeps: CliDeps = {
  startAnvil: ({ port }) => startAnvil({ port }),
  startServer: ({ anvilUrl }) => startProbeServer({ root: PAGE_ROOT, anvilUrl, reference: loadProfile('metamask'), dappressVersion: dappressVersion() }),
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  onStop: (handler) => {
    process.once('SIGINT', handler);
    process.once('SIGTERM', handler);
  },
  onExit: (handler) => {
    process.once('exit', handler);
  },
};

/** Run the command line. Yields the exit code, or undefined while the probe runs. */
export async function runCli(args: string[], deps: CliDeps = defaultDeps): Promise<number | undefined> {
  const parsed = parseArgs(args);
  if ('error' in parsed) {
    deps.error(parsed.error);
    return 1;
  }
  let anvil: Anvil;
  try {
    anvil = await deps.startAnvil({ port: parsed.anvilPort });
  } catch (error) {
    deps.error((error as Error).message);
    return 1;
  }
  // Anvil is a child process that outlives a crash of this one, so it stops with the process however that ends
  deps.onExit(() => anvil.stop());
  let server: ProbeServer;
  try {
    server = await deps.startServer({ anvilUrl: anvil.url });
  } catch (error) {
    anvil.stop();
    deps.error((error as Error).message);
    return 1;
  }
  let stopping = false;
  deps.onStop(() => {
    // A second signal (Ctrl+C, then a SIGTERM) must not close twice
    if (stopping) return;
    stopping = true;
    // Closing cuts the connections still open, so nothing keeps the process alive once Anvil is stopped
    void server
      .close()
      .catch(() => undefined)
      .finally(() => anvil.stop());
  });
  deps.log(`[dappress] Anvil runs on ${anvil.url}, for this session only.`);
  deps.log(`[dappress] Open ${server.url} in the browser where the wallet to record is installed, and follow the page.`);
  deps.log('[dappress] Use a test wallet: the profile holds its addresses and signatures, and is made to be shared.');
  deps.log('[dappress] Ctrl+C stops the page and Anvil.');
  return undefined;
}
