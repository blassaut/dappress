// The probe page: choose the wallet, send it the flow's requests one by one,
// then build its profile, compare it with MetaMask's and download it. The
// recorder (recorder.js, loaded first) records everything the wallet answers;
// this file only asks and shows. Text goes in with textContent: a wallet's
// name and its answers are not ours.
//
// The end-to-end run reads data-state, data-decision and data-expect on
// #probe to answer each prompt with Dappress's commands, data-attempt to
// tell the next request from the one it answered, and the profile on
// window.dappressProbe.

import { buildProfile, diffProfiles, type Profile, type TraceChunk } from '../../profile-build';
import { STEPS, ASKING_AFTER, classify, chunksOf, describeOutcome, plainTrace, type Context, type Mark, type Outcome, type Step } from '../flow';
import { anvilClient } from './anvil-client';

interface Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
}
interface Announced {
  info: { name?: string; icon?: string; rdns?: string };
  provider: Provider;
}

declare global {
  interface Window {
    __dappressTrace?: TraceChunk;
    dappressProbe?: { profile: Profile };
  }
}

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
// Not declared on Window: the conformance support files declare it differently,
// and all of them share one global type-check
const injected = () => (window as unknown as { ethereum?: Provider }).ethereum;
const probe = element('probe');
const VERSION = /^\d+(\.\d+){1,3}$/;
// How long the wallets have to announce themselves (EIP-6963) once asked
const DISCOVERY = 500;
// The requests sent so far, on #probe as data-attempt
let attempts = 0;

function setState(state: string, step?: Step): void {
  probe.dataset.state = state;
  probe.dataset.decision = step?.decision ?? '';
  probe.dataset.expect = step?.expect ?? '';
}

function show(id: string, shown = true): void {
  element(id).hidden = !shown;
}

/** The wallets announced through EIP-6963, else window.ethereum alone. */
async function discover(): Promise<Announced[]> {
  const announced: Announced[] = [];
  const listen = (event: Event) => {
    const detail = (event as CustomEvent<Announced>).detail;
    if (detail?.provider && !announced.some((known) => known.provider === detail.provider)) announced.push(detail);
  };
  window.addEventListener('eip6963:announceProvider', listen);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise((resolve) => setTimeout(resolve, DISCOVERY));
  window.removeEventListener('eip6963:announceProvider', listen);
  if (!announced.length && injected()) announced.push({ info: { name: 'window.ethereum' }, provider: injected()! });
  return announced;
}

/** The wallet chosen, its version, and whether others are active in the page. */
function choose(wallets: Announced[]): Promise<{ wallet: Announced; version: string; otherWallets: boolean }> {
  show('choose');
  setState('choosing');
  const list = element('wallets');
  const version = element<HTMLInputElement>('version');
  const start = element<HTMLButtonElement>('start');
  let chosen: Announced | undefined;
  if (!wallets.length) show('no-wallet');
  wallets.forEach((wallet, index) => {
    const item = document.createElement('li');
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'wallet';
    radio.value = String(index);
    radio.addEventListener('change', () => {
      chosen = wallet;
      const injectedElsewhere = injected() !== undefined && injected() !== wallet.provider;
      const others = element('others');
      others.textContent = injectedElsewhere
        ? 'window.ethereum belongs to another wallet: the identity flags in the profile would be its. Disable the other wallet extensions, then reload, or go on and the profile will say so.'
        : '';
      others.hidden = !injectedElsewhere;
      update();
    });
    label.append(radio);
    // A wallet's icon is a data: URI (EIP-6963); anything else is left out
    if (wallet.info.icon?.startsWith('data:image/')) {
      const icon = document.createElement('img');
      icon.src = wallet.info.icon;
      icon.alt = '';
      label.append(icon);
    }
    const name = document.createElement('span');
    name.textContent = wallet.info.name ?? wallet.info.rdns ?? 'A wallet';
    label.append(name);
    item.append(label);
    list.append(item);
  });
  const update = () => {
    start.disabled = !chosen || !VERSION.test(version.value.trim());
  };
  version.addEventListener('input', update);
  return new Promise((resolve) =>
    start.addEventListener('click', () => {
      show('choose', false);
      const otherWallets = wallets.length > 1 || (injected() !== undefined && injected() !== chosen!.provider);
      resolve({ wallet: chosen!, version: version.value.trim(), otherWallets });
    }),
  );
}

function listStep(title: string, text: string, verdict: string): void {
  const item = document.createElement('li');
  item.dataset.verdict = verdict;
  item.textContent = title;
  const outcome = document.createElement('span');
  outcome.className = 'outcome';
  outcome.textContent = verdict === 'without-asking' ? `${text} (the wallet answered without asking)` : text;
  item.append(outcome);
  element('steps').append(item);
}

/**
 * Wait for a click on one of the buttons, and say which. Its listeners go
 * at the first click, or when `signal` aborts: a wait nobody needs any more
 * leaves none behind.
 */
function clicked<T extends string>(ids: T[], signal?: AbortSignal): Promise<T> {
  return new Promise((resolve) => {
    const done = new AbortController();
    signal?.addEventListener('abort', () => done.abort(), { once: true, signal: done.signal });
    for (const id of ids) {
      element(id).addEventListener(
        'click',
        () => {
          done.abort();
          resolve(id);
        },
        { signal: done.signal },
      );
    }
  });
}

/** Send the step's request, and wait for its outcome, or for the user to skip it. */
async function send(provider: Provider, step: Step, context: Context): Promise<Outcome | undefined> {
  const request = step.request!(context);
  const started = Date.now();
  // A new request each time, also for a step done again: the end-to-end run
  // answers a prompt once, and waits for the next request before it reads
  // the page again
  probe.dataset.attempt = String(++attempts);
  setState('running', step);
  const asking = setTimeout(() => {
    setState('waiting', step);
    element<HTMLButtonElement>('skip').disabled = false;
  }, ASKING_AFTER);
  // A provider that throws instead of rejecting gives an error outcome all
  // the same, and the timer above is cleared on every path
  const settled = new Promise((resolve) => resolve(provider.request(request))).then(
    (result) => ({ result }),
    (error: { code?: unknown; message?: string }) => ({ error: { code: error?.code, message: error?.message } }),
  );
  const race = new AbortController();
  const skipped = clicked(['skip'], race.signal).then(() => undefined);
  const outcome = await Promise.race([settled.then((value) => ({ ...value, asked: Date.now() - started >= ASKING_AFTER }) as Outcome), skipped]);
  race.abort();
  clearTimeout(asking);
  element<HTMLButtonElement>('skip').disabled = true;
  // The wallet has answered: the step no longer waits on it
  setState('running', step);
  return outcome;
}

async function runFlow(provider: Provider, context: Context): Promise<Mark[]> {
  show('run');
  const trace = window.__dappressTrace!;
  const anvil = anvilClient(context.anvilUrl);
  const marks: Mark[] = [];
  for (const step of STEPS) {
    element('instruction').textContent = `${step.title}. ${step.instruction}`;
    for (;;) {
      if (step.setup) {
        setState('running', step);
        try {
          await step.setup(context, anvil);
          listStep(step.title, 'done', 'as-asked');
        } catch (error) {
          listStep(step.title, `skipped: ${(error as Error).message}`, 'skipped');
        }
        break;
      }
      let outcome: Outcome | undefined;
      try {
        outcome = await send(provider, step, context);
      } catch (error) {
        // A step that needs what an earlier one did not get: the account, the token
        listStep(step.title, `skipped: ${(error as Error).message}`, 'skipped');
        break;
      }
      if (!outcome) {
        // The request may still be pending in the wallet: an answer to it now lands in a later step's part of the trace
        listStep(step.title, 'skipped: close its prompt in your wallet; a later answer is recorded under a later step', 'skipped');
        break;
      }
      step.learn?.(context, outcome);
      const verdict = classify(step.expect, outcome);
      listStep(step.title, describeOutcome(outcome), verdict);
      if (verdict !== 'not-as-asked') break;
      setState('not-as-asked', step);
      element('mismatch').textContent =
        `This step asked you to ${step.expect} in your wallet, and the wallet answered: ${describeOutcome(outcome)}. Both are recorded.`;
      show('not-as-asked');
      const choice = await clicked(['redo', 'keep']);
      show('not-as-asked', false);
      if (choice === 'keep') break;
    }
    marks.push({ test: step.title, to: trace.entries.length });
  }
  show('run', false);
  return marks;
}

function finish(profile: Profile, reference: Profile): void {
  window.dappressProbe = { profile };
  show('done');
  setState('finished');
  const methods = Object.keys(profile.methods).length;
  const events = Object.keys(profile.events).length;
  element('summary').textContent = `${profile.wallet.name} ${profile.wallet.version}: ${methods} methods and ${events} events recorded.`;
  const file = `${
    profile.wallet.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'wallet'
  }-${profile.wallet.version}.json`;
  element('usage').textContent = `mock: './${file}'`;
  element('diff').textContent = diffProfiles(reference, profile);
  element('download').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`${JSON.stringify(profile, null, 2)}\n`], { type: 'application/json' }));
    link.download = file;
    link.click();
    URL.revokeObjectURL(link.href);
  });
}

/** A file of the page's server, as JSON: an error page is not parsed for one. */
async function fetchJson<T>(route: string): Promise<T> {
  const response = await fetch(route);
  if (!response.ok) throw new Error(`[dappress] The page's server answered ${response.status} for ${route}: restart dappress probe`);
  return (await response.json()) as T;
}

async function main(): Promise<void> {
  if (!window.__dappressTrace) throw new Error('The recorder did not load: reload the page.');
  const config = await fetchJson<{ anvilUrl: string; dappressVersion: string }>('/config.json');
  const reference = await fetchJson<Profile>('/reference-profile.json');
  const wallets = await discover();
  const { wallet, version, otherWallets } = await choose(wallets);
  // Leaving the page loses the session
  const leaving = (event: BeforeUnloadEvent) => event.preventDefault();
  window.addEventListener('beforeunload', leaving);
  let marks: Mark[];
  try {
    marks = await runFlow(wallet.provider, { anvilUrl: config.anvilUrl });
  } finally {
    // A flow that failed has no session left to lose
    window.removeEventListener('beforeunload', leaving);
  }
  const trace = plainTrace(window.__dappressTrace);
  const profile = buildProfile(chunksOf(trace, marks), {
    wallet: { name: wallet.info.name ?? 'Unknown wallet', version },
    recorded: {
      by: `dappress probe ${config.dappressVersion}`,
      date: new Date().toISOString(),
      browser: navigator.userAgent,
      ...(otherWallets ? { otherWallets } : {}),
    },
  });
  finish(profile, reference);
}

main().catch((error: Error) => {
  setState('failed');
  const failure = element('failure');
  failure.textContent = `The probe stopped: ${error.message}`;
  failure.hidden = false;
});
