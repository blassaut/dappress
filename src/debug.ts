// Diagnostics for a run that fails now and then, on with DAPPRESS_DEBUG=1:
// each task and each connection to the browser, with its duration; any moment
// the plugins' process stops answering; the browser's targets as they come
// and go; and Chrome's own log. Off, nothing is logged and nothing runs.
// CONTRIBUTING.md says how to read them.

export const debugging = Boolean(process.env.DAPPRESS_DEBUG);

const started = Date.now();

/** Log `message` with the time since the plugin loaded, when debugging. */
export function debug(message: string): void {
  if (debugging) console.log(`[dappress debug +${((Date.now() - started) / 1000).toFixed(1)}s] ${message}`);
}

/** Time `work`, logging its start and its end, when debugging. */
export async function timed<T>(what: string, work: () => Promise<T>): Promise<T> {
  if (!debugging) return work();
  const at = Date.now();
  debug(`${what}: start`);
  try {
    const result = await work();
    debug(`${what}: done in ${Date.now() - at} ms`);
    return result;
  } catch (error) {
    debug(`${what}: failed in ${Date.now() - at} ms: ${(error as Error).message?.split('\n')[0]}`);
    throw error;
  }
}

/**
 * Report every stretch of a second or more during which the event loop ran
 * nothing: a task can only be answered when it runs. Once per process.
 */
let watching = false;
export function watchEventLoop(): void {
  if (!debugging || watching) return;
  watching = true;
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (now - last > 1500) debug(`event loop blocked for ${now - last - 500} ms`);
    last = now;
  }, 500).unref();
}

/**
 * Log, for the whole run, the browser's targets as they come, change and go:
 * MetaMask's service worker, side panel, popup and home page, and Cypress's
 * own tab. A connection of its own that only discovers targets, attached to
 * none: it changes nothing in what it watches. Once per process.
 */
let observing = false;
export function observeBrowser(debuggerUrl: string): void {
  if (!debugging || observing) return;
  observing = true;
  const socket = new WebSocket(debuggerUrl);
  const watched = (url: string) => !url.startsWith('devtools://') && url !== 'about:blank';
  const known = new Map<string, string>();
  socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Target.setDiscoverTargets', params: { discover: true } })));
  socket.addEventListener('message', ({ data }) => {
    const { method, params } = JSON.parse(String(data));
    if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') {
      const { targetId, type, url } = params.targetInfo;
      if (!watched(url) || known.get(targetId) === url) return;
      debug(`target ${known.has(targetId) ? 'changed' : 'created'}: ${type} ${targetId.slice(0, 8)} ${url}`);
      known.set(targetId, url);
    }
    if (method === 'Target.targetDestroyed' && known.has(params.targetId)) {
      debug(`target destroyed: ${params.targetId.slice(0, 8)} ${known.get(params.targetId)}`);
      known.delete(params.targetId);
    }
  });
  socket.addEventListener('close', () => debug('target observer disconnected'));
}

/**
 * Chrome's own log, from every one of its processes, the network service's
 * included: on its standard error, which Cypress logs under
 * DEBUG=cypress:launcher:browsers.
 */
export function browserLogArgs(): string[] {
  return debugging ? ['--enable-logging=stderr', '--v=0'] : [];
}
