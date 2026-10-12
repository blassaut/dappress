// The local node the probe page sends its transactions to: Anvil, started for
// the session on the loopback, stopped with it. Never one already running,
// which may be the user's own development node, with its state.

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const ANVIL_PORT = 8545;
// How long Anvil may take to answer once started, in steps of POLL
const POLL = 100;
const START_ATTEMPTS = 100;
// How long one probe of Anvil may wait for its answer
const ANSWER_TIMEOUT = 1000;

export interface Anvil {
  url: string;
  stop(): void;
}

/** A Foundry tool: from Foundry's own folder when it is there, else from the PATH. */
export function foundry(tool: string): string {
  const installed = path.join(os.homedir(), '.foundry', 'bin', tool);
  return fs.existsSync(installed) ? installed : tool;
}

/** Whether something accepts connections on 127.0.0.1:`port`. */
export function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function answers(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}',
      // A node that accepts the connection and never answers must not hold the start
      signal: AbortSignal.timeout(ANSWER_TIMEOUT),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Start Anvil on 127.0.0.1:`port`, once nothing listens there, and wait until it answers. */
export async function startAnvil({ port = ANVIL_PORT, binary = foundry('anvil') }: { port?: number; binary?: string } = {}): Promise<Anvil> {
  if (await isListening(port)) throw new Error(`[dappress] Something already listens on 127.0.0.1:${port}: stop it, or pass --anvil-port`);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(binary, ['--silent', '--host', '127.0.0.1', '--port', String(port)], { stdio: 'ignore' });
  // Why Anvil cannot answer: it could not start, or it stopped
  let failure: Error | undefined;
  child.once('error', (error: NodeJS.ErrnoException) => {
    failure = error.code === 'ENOENT' ? new Error('[dappress] Anvil is not installed. It is part of Foundry: getfoundry.sh') : error;
  });
  child.once('exit', (code, signal) => {
    failure ??= new Error(`[dappress] Anvil stopped as it started, ${signal ? `on ${signal}` : `with code ${String(code)}`}`);
  });
  for (let attempt = 0; attempt < START_ATTEMPTS && !failure; attempt++) {
    if (await answers(url)) return { url, stop: () => void child.kill() };
    await new Promise((resolve) => setTimeout(resolve, POLL));
  }
  child.kill();
  throw failure ?? new Error(`[dappress] Anvil did not answer on ${url}`);
}
