// The probe page's server: the page's few files, read once at the start and
// served from memory, to the loopback only. No path from a request ever
// reaches the disk, nothing is written, and a request for another host is
// refused, so that a site pointing its own name at the machine (DNS
// rebinding) reads nothing. The page builds the profile and downloads it
// itself: the server has nothing to receive.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Profile } from '../profile-schema';

/** The files of dist/probe the page needs, by the route that serves each. */
export const PAGE_FILES: Record<string, { name: string; type: string }> = {
  '/': { name: 'index.html', type: 'text/html; charset=utf-8' },
  '/probe.js': { name: 'probe.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { name: 'style.css', type: 'text/css; charset=utf-8' },
  '/recorder.js': { name: 'recorder.js', type: 'text/javascript; charset=utf-8' },
};
const JSON_TYPE = 'application/json; charset=utf-8';

export interface ProbeServerOptions {
  /** The folder of the built page: dist/probe. */
  root: string;
  /** Anvil's URL, which the page reaches and its policy names. */
  anvilUrl: string;
  /** The profile the page compares the recorded one with: MetaMask's. */
  reference: Profile;
  dappressVersion: string;
}

export interface ProbeServer {
  /** http://127.0.0.1:<port>/ */
  url: string;
  close(): Promise<void>;
}

export async function startProbeServer({ root, anvilUrl, reference, dappressVersion }: ProbeServerOptions): Promise<ProbeServer> {
  const routes = new Map<string, { body: Buffer; type: string }>();
  for (const [route, file] of Object.entries(PAGE_FILES)) {
    const source = path.join(root, file.name);
    if (!fs.existsSync(source)) throw new Error(`[dappress] The probe page is not built: ${file.name} is missing from ${root}`);
    routes.set(route, { body: fs.readFileSync(source), type: file.type });
  }
  routes.set('/config.json', { body: Buffer.from(JSON.stringify({ anvilUrl, dappressVersion })), type: JSON_TYPE });
  routes.set('/reference-profile.json', { body: Buffer.from(JSON.stringify(reference)), type: JSON_TYPE });

  const policy = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    // A wallet's EIP-6963 icon is a data: URI
    "img-src 'self' data:",
    `connect-src 'self' ${new URL(anvilUrl).origin}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  let hosts: string[] = [];

  const server = http.createServer((request, response) => {
    response.setHeader('Content-Security-Policy', policy);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    if (!hosts.includes(request.headers.host ?? '')) return end(response, 403);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      return end(response, 405);
    }
    // The route is looked up as is, query left aside: anything not listed is not served
    const route = (request.url ?? '/').split('?')[0];
    const file = routes.get(route);
    if (!file) return end(response, 404);
    response.writeHead(200, { 'Content-Type': file.type, 'Content-Length': file.body.length });
    response.end(request.method === 'HEAD' ? undefined : file.body);
  });
  let failStart: (error: Error) => void = () => undefined;
  await new Promise<void>((resolve, reject) => {
    failStart = reject;
    server.on('error', failStart);
    server.listen(0, '127.0.0.1', resolve);
  });
  // The listener only serves the start: once listening, an error is no longer its to report
  server.off('error', failStart);
  const { port } = server.address() as AddressInfo;
  hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        // close() alone waits for every open socket, including one that never sent a request (a browser's preconnect); everything is served from memory, so cutting them loses nothing
        server.closeAllConnections();
      }),
  };
}

function end(response: http.ServerResponse, status: number): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(http.STATUS_CODES[status]);
}
