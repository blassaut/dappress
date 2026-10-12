# Probe Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx dappress probe` starts a local Anvil and a read-only local page that records the profile of the wallet installed in the user's browser, step by step, and offers it as a download.

**Architecture:** The profile code moves from `scripts/profile.ts` into `src/`, split from its file access, so that both Node and the page use it. A pure flow module (`src/probe/flow.ts`) holds the steps and the verdict on each outcome. Node modules start Anvil (`src/probe/anvil.ts`) and serve the page from memory (`src/probe/server.ts`), behind a `bin` entry (`src/cli.ts`, `src/probe/command.ts`). The page (`src/probe/page/`) is bundled by esbuild into `dist/probe/`. The conformance suite goes through the page with Dappress's commands, on the real MetaMask and on the mocks.

**Tech Stack:** TypeScript (CommonJS build with `tsc`), `node:http`, `node:child_process`, `node:test` through `tsx`, esbuild 0.28.2 for the page bundle, Cypress 16 and Dappress for the end-to-end run, Foundry (Anvil, and Forge once to compile the test token).

**Spec:** `docs/superpowers/specs/2026-10-12-probe-page-design.md`

**Conventions of the repository, to keep:**
- Comments say why, in full sentences, like the surrounding code.
- Error messages start with `[dappress] `.
- Commit messages are a plain sentence in the imperative, no prefix, and **no `Co-Authored-By` or "Generated with" line**.
- `npm run check` runs lint, Prettier, types and the unit tests: it passes after every task.
- No `https://` in anything under `src/` that ends up in `dist/`: SECURITY.md promises that `grep -r "https://" dist` finds only MetaMask's releases. Write hosts without the scheme (`getfoundry.sh`).

---

## File structure

| File | Responsibility |
|---|---|
| `src/profile-schema.ts` (new) | The profile's types and `SCHEMA`, with no import: usable in Node and in the page |
| `src/wallet-profile.ts` (modified) | Loads a profile from disk; re-exports `profile-schema` |
| `src/profile-build.ts` (new, moved from `scripts/profile.ts`) | `buildProfile`, `diffProfiles`, `shape`, `outcomeSet`: pure functions |
| `src/profile-build.test.ts` (moved from `scripts/profile.test.ts`) | Their tests |
| `scripts/profile.ts` (modified) | The `npm run profile` command line, and `readTrace` (file access) |
| `scripts/profile.test.ts` (rewritten) | The test of `readTrace` |
| `src/probe/flow.ts` (new) | The steps, the verdict on an outcome, the chunks of the trace |
| `src/probe/flow.test.ts` (new) | Their tests |
| `src/probe/anvil.ts` (new) | Start and stop Anvil, refuse a taken port, explain a missing Anvil |
| `src/probe/anvil.test.ts` (new) | Its tests |
| `src/probe/server.ts` (new) | The read-only server of the page |
| `src/probe/server.test.ts` (new) | Its tests |
| `src/probe/command.ts` (new) | `dappress probe`: arguments, start, stop |
| `src/probe/command.test.ts` (new) | Its tests |
| `src/cli.ts` (new) | The `bin` entry |
| `src/probe/TestToken.sol` (new) | The test token's source |
| `src/probe/page/token.ts` (new, generated once) | Its bytecode |
| `src/probe/page/anvil-client.ts` (new) | The page's calls to Anvil: fund, deploy the token |
| `src/probe/page/anvil-client.test.ts` (new) | Its tests |
| `src/probe/page/main.ts` (new) | The page: choose the wallet, run the flow, show and download the profile |
| `src/probe/page/index.html`, `src/probe/page/style.css` (new) | The page's markup and style |
| `scripts/build-probe.ts` (new) | Bundles the page into `dist/probe/` |
| `scripts/conformance.ts` (modified) | `--probe`: the end-to-end run through the page |
| `conformance/cypress.probe.config.ts`, `conformance/cypress/support/probe.ts`, `conformance/cypress/probe/probe.cy.ts` (new) | The end-to-end run |
| `.github/workflows/conformance.yml`, `.github/workflows/ci.yml` (modified) | The probe jobs, the deterministic build |
| `package.json`, `tsconfig.build.json`, `eslint.config.mjs` (modified) | `bin`, build, test glob, esbuild, browser globals |
| `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` (modified) | Documentation |

---

### Task 1: Split the profile's types from its loading

The page cannot import `src/wallet-profile.ts`, which reads files with `node:fs`. Its types and `SCHEMA` move to a module with no import.

**Files:**
- Create: `src/profile-schema.ts`
- Modify: `src/wallet-profile.ts` (lines 1-70)

- [ ] **Step 1: Create `src/profile-schema.ts`**

```ts
// The shape of a wallet profile: what a dapp sees of a wallet, as
// conformance/recorder.js recorded it and src/profile-build.ts shaped it.
// Types and the schema's name only, with no import: Node and the probe page
// both read them.

export const SCHEMA = 'dappress-wallet-profile/0';

/** What the recorder found out about the provider's injection. */
export interface Discovery {
  /** Whether the provider was there when the recorder ran, or came later. */
  injected: 'before' | 'after' | null;
  /** The identity flags the provider carries: isMetaMask, isRabby… */
  flags: Record<string, boolean>;
  /** The providers announced through EIP-6963. */
  eip6963: { rdns?: string; name?: string; sameAsInjected?: boolean }[];
}

export interface ProviderError {
  code?: unknown;
  message?: string;
  data?: unknown;
}

/**
 * One line of the recorder's trace: a request settled, or an event received.
 * `via` says which provider it went through: `injected` for window.ethereum,
 * `eip6963:<rdns>` for one announced that is another object.
 */
export type TraceEntry =
  | { kind: 'request'; seq: number; at: number; via?: string; method: string; params?: unknown; result?: unknown; error?: ProviderError; ms: number }
  | { kind: 'event'; seq: number; at: number; via?: string; name: string; payload: unknown };

/** What the recorder holds in the page, and what the suite sends after each test. */
export interface TraceChunk {
  recorder: string;
  /** The Cypress test, or the probe page's step, the entries were recorded in; none from a console. */
  test?: string;
  discovery?: Discovery;
  entries: TraceEntry[];
}

/** A request as observed: its parameters and what came back. Repeats in a row are counted, not listed. */
export interface Observation {
  test?: string;
  via?: string;
  params?: unknown;
  result?: unknown;
  error?: ProviderError;
  count?: number;
}

export interface EventObservation {
  test?: string;
  via?: string;
  payload: unknown;
  count?: number;
}

export interface Profile {
  schema: typeof SCHEMA;
  wallet: { name: string; version: string };
  /** Who recorded it and how. `otherWallets`: other wallets were active in the page, whose flags may be in `discovery`. */
  recorded: { by: string; date: string; recorder: string; mode?: string; browser?: string; otherWallets?: boolean };
  discovery: Discovery | null;
  methods: Record<string, Observation[]>;
  events: Record<string, EventObservation[]>;
}
```

- [ ] **Step 2: Replace the types in `src/wallet-profile.ts`**

In `src/wallet-profile.ts`, replace everything from the line `export const SCHEMA = 'dappress-wallet-profile/0';` through the closing `}` of `export interface Profile { … }` (the block that ends just before `// The profiles the package ships`) with:

```ts
import { SCHEMA, type Profile } from './profile-schema';

export * from './profile-schema';
```

Keep the header comment and the `import fs from 'node:fs';` and `import path from 'node:path';` lines above it, and everything from `// The profiles the package ships` down, unchanged.

- [ ] **Step 3: Run the checks**

Run: `npm run check`
Expected: lint, Prettier and types pass, and every unit test passes (116 tests on `main` when this plan was written). Nothing changed in behaviour: every importer of `wallet-profile` still finds the same names.

- [ ] **Step 4: Commit**

```bash
git add src/profile-schema.ts src/wallet-profile.ts
git commit -m "Split the profile's types from its loading, for a page to read them"
```

---

### Task 2: Move the profile code into `src/`

**Files:**
- Create: `src/profile-build.ts`
- Move: `scripts/profile.test.ts` → `src/profile-build.test.ts`
- Modify: `scripts/profile.ts`
- Create: `scripts/profile.test.ts` (the `readTrace` test only)

- [ ] **Step 1: Move the tests and point them at the new module**

```bash
git mv scripts/profile.test.ts src/profile-build.test.ts
```

In `src/profile-build.test.ts`:
- Replace the import line `import { buildProfile, diffProfiles, readTrace, shape, SCHEMA, type Profile, type TraceChunk } from './profile';` with:

```ts
import { buildProfile, diffProfiles, outcomeSet, shape, SCHEMA, type Profile, type TraceChunk } from './profile-build';
```

- Delete the three lines `import fs from 'node:fs';`, `import os from 'node:os';` and `import path from 'node:path';`: only the `readTrace` test used them.
- Delete the whole test `test('the trace is read as one chunk, a list of chunks, or one chunk per line', () => { … });`, from its first line through its closing `});` and the blank line after it.
- Add at the end of the file:

```ts
test('the distinct outcomes of a method, as the diff shows them', () => {
  const observations = buildProfile(chunks, meta).methods;
  assert.deepEqual(outcomeSet(observations.personal_sign), ['error 4001 "User rejected the request."']);
  assert.deepEqual(outcomeSet(observations.eth_accounts), ['result []', 'result hex[]']);
  assert.deepEqual(outcomeSet(undefined), []);
});
```

- [ ] **Step 2: Run the moved tests to see them fail**

Run: `npx tsx --test src/profile-build.test.ts`
Expected: FAIL, `Cannot find module './profile-build'`.

- [ ] **Step 3: Create `src/profile-build.ts`**

Move into it, unchanged, everything of `scripts/profile.ts` from `export interface ProfileMeta` through `function payloads(…) { … }`, except `readTrace`, and change `outcomes` as shown. The full file:

```ts
// Builds a wallet profile from the recorder's trace, and compares two: what a
// dapp sees of a wallet, each request with its result or error, each event
// with its payload, and how the provider was found, grouped by method and by
// event, with the test or the step that provoked each observation. Nothing is
// interpreted: what was not observed is not in the profile. Pure functions:
// scripts/profile.ts, the conformance suite and the probe page share them.

import { SCHEMA, type EventObservation, type Observation, type Profile, type TraceChunk } from './profile-schema';

export {
  SCHEMA,
  type Discovery,
  type EventObservation,
  type Observation,
  type Profile,
  type ProviderError,
  type TraceChunk,
  type TraceEntry,
} from './profile-schema';

export interface ProfileMeta {
  wallet: Profile['wallet'];
  recorded: Omit<Profile['recorded'], 'recorder'>;
}

/** Build the profile of a wallet from the trace chunks recorded on it. */
export function buildProfile(chunks: TraceChunk[], meta: ProfileMeta): Profile {
  const methods: Record<string, Observation[]> = {};
  const events: Record<string, EventObservation[]> = {};
  // In the order recorded: the chunks as they came, then the sequence within each.
  // `at` restarts with the page, so it orders nothing across chunks
  const entries = chunks.flatMap((chunk) => [...chunk.entries].sort((a, b) => a.seq - b.seq).map((entry) => ({ entry, test: chunk.test })));
  for (const { entry, test } of entries) {
    if (entry.kind === 'request') {
      const observation: Observation = { test, params: trim(entry.params) };
      if (entry.via) observation.via = entry.via;
      if (entry.error) observation.error = entry.error.data === undefined ? entry.error : { ...entry.error, data: trim(entry.error.data) };
      else observation.result = trim(entry.result);
      push(methods, entry.method, observation);
    } else {
      const observation: EventObservation = { test, payload: trim(entry.payload) };
      if (entry.via) observation.via = entry.via;
      push(events, entry.name, observation);
    }
  }
  return {
    schema: SCHEMA,
    wallet: meta.wallet,
    recorded: { ...meta.recorded, recorder: chunks.find((chunk) => chunk.recorder)?.recorder ?? 'unknown' },
    // The last one: the discovery fills in as the page goes, with the providers announced later
    discovery: [...chunks].reverse().find((chunk) => chunk.discovery)?.discovery ?? null,
    methods: sorted(methods),
    events: sorted(events),
  };
}

/** A value longer than this, as JSON, is kept by its shape: a block, a receipt or a contract's bytecode says nothing of the wallet. */
export const VALUE_LIMIT = 1024;

export function trim(value: unknown): unknown {
  const json = JSON.stringify(value);
  if (json === undefined || json.length <= VALUE_LIMIT) return value;
  return { $truncated: json.length, shape: shape(value) };
}

// Add the observation, or count it when it repeats the one before: the test
// dapp and the suite ask the same thing again and again while they wait
function push<T extends { count?: number }>(groups: Record<string, T[]>, key: string, observation: T): void {
  const group = (groups[key] ??= []);
  const last = group.at(-1);
  if (last && same(last, observation)) {
    last.count = (last.count ?? 1) + 1;
    return;
  }
  group.push(observation);
}

const same = (a: object, b: object) => JSON.stringify({ ...a, count: undefined }) === JSON.stringify({ ...b, count: undefined });

const sorted = <T>(groups: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));

// The hex lengths that tell what a value is: an address, a hash, a signature. Any other is a quantity
const HEX_KINDS: Record<number, string> = { 40: 'address', 64: 'hash', 130: 'signature' };

/**
 * The shape of a value, with what a dapp would branch on and nothing it would
 * not: a hex string as an address, a hash, a signature or a quantity, a string
 * by its text when short, numbers, booleans, arrays by their elements, objects
 * by their keys.
 */
export function shape(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'string') {
    if (/^0x[0-9a-fA-F]*$/.test(value)) return HEX_KINDS[value.length - 2] ?? 'hex';
    return value.length <= 80 ? JSON.stringify(value) : `string(${value.length})`;
  }
  if (typeof value !== 'object') return typeof value === 'number' ? `number(${value})` : String(value);
  if (Array.isArray(value)) {
    const shapes = [...new Set(value.map(shape))];
    if (value.length === 0) return '[]';
    // Elements of one shape, however many: a list of addresses is a list of addresses
    if (shapes.length === 1) return `${shapes[0]}[]`;
    return value.length <= 3 ? `[${value.map(shape).join(', ')}]` : `array(${value.length})`;
  }
  // A value the profile kept by its shape
  const kept = value as { $truncated?: unknown; shape?: unknown };
  if (kept.$truncated !== undefined && typeof kept.shape === 'string') return kept.shape;
  return `{${Object.keys(value).sort().join(', ')}}`;
}

/** What two profiles answer differently, as a Markdown table per method and per event. */
export function diffProfiles(a: Profile, b: Profile): string {
  const lines: string[] = [];
  const label = (profile: Profile) => `${profile.wallet.name} ${profile.wallet.version}`;
  lines.push(`# ${label(a)} vs ${label(b)}`, '');

  lines.push('## Discovery', '', '| | ' + label(a) + ' | ' + label(b) + ' |', '| --- | --- | --- |');
  lines.push(`| injected | ${a.discovery?.injected ?? '?'} | ${b.discovery?.injected ?? '?'} |`);
  const flags = new Set([...Object.keys(a.discovery?.flags ?? {}), ...Object.keys(b.discovery?.flags ?? {})]);
  for (const flag of [...flags].sort()) lines.push(`| ${flag} | ${a.discovery?.flags[flag] ?? '?'} | ${b.discovery?.flags[flag] ?? '?'} |`);
  const rdns = (profile: Profile) => (profile.discovery?.eip6963 ?? []).map((p) => p.rdns ?? '?').join(', ') || 'none';
  lines.push(`| EIP-6963 | ${rdns(a)} | ${rdns(b)} |`, '');

  lines.push('## Methods', '', `| Method | ${label(a)} | ${label(b)} | Same |`, '| --- | --- | --- | --- |');
  for (const method of keys(a.methods, b.methods)) {
    const left = outcomes(a.methods[method]);
    const right = outcomes(b.methods[method]);
    lines.push(`| \`${method}\` | ${left} | ${right} | ${left === right ? 'yes' : '**no**'} |`);
  }
  lines.push('');

  lines.push('## Events', '', `| Event | ${label(a)} | ${label(b)} | Same |`, '| --- | --- | --- | --- |');
  for (const event of keys(a.events, b.events)) {
    const left = payloads(a.events[event]);
    const right = payloads(b.events[event]);
    lines.push(`| \`${event}\` | ${left} | ${right} | ${left === right ? 'yes' : '**no**'} |`);
  }
  return lines.join('\n') + '\n';
}

const keys = (a: object, b: object) => [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();

/** The distinct outcomes of a method: result shapes, and errors by code and message, sorted. */
export function outcomeSet(observations: Observation[] | undefined): string[] {
  const seen = new Set<string>();
  for (const observation of observations ?? []) {
    if (observation.error) seen.add(`error ${String(observation.error.code)} ${JSON.stringify(observation.error.message ?? '')}`);
    else seen.add(`result ${shape(observation.result)}`);
  }
  return [...seen].sort();
}

function outcomes(observations: Observation[] | undefined): string {
  return observations ? outcomeSet(observations).join('<br>') : 'not observed';
}

function payloads(observations: EventObservation[] | undefined): string {
  if (!observations) return 'not observed';
  return [...new Set(observations.map((observation) => shape(observation.payload)))].sort().join('<br>');
}
```

- [ ] **Step 4: Rewrite `scripts/profile.ts` around it**

Replace the whole file with:

```ts
// A wallet profile: what a dapp sees of a wallet, as conformance/recorder.js
// recorded it. src/profile-build.ts builds and compares profiles; this is its
// command line, and the reading of a trace file.
//
//   npm run profile -- build <trace.json> --wallet <name> --version <x.y.z> [--out <file>]
//   npm run profile -- diff <a.json> <b.json>
//
// `build` turns a trace into a profile: the chunks the conformance suite sent
// (one per test), or the single trace copied from a browser console. `diff`
// prints, method by method and event by event, where two profiles differ in
// the shape of what the wallet answers: the one table a dapp developer needs.

import fs from 'node:fs';

import { buildProfile, diffProfiles, type TraceChunk } from '../src/profile-build';

export * from '../src/profile-build';

/** The trace as a console copy gives it (one chunk) or as the suite's file holds it (one chunk per line). */
export function readTrace(file: string): TraceChunk[] {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text) as TraceChunk[];
  if (text.startsWith('{') && !text.includes('\n{')) return [JSON.parse(text) as TraceChunk];
  return text.split('\n').map((line) => JSON.parse(line) as TraceChunk);
}

function main(args: string[]): void {
  const [command] = args;
  if (command === 'build') {
    const { options, positional } = parse(args.slice(1), ['wallet', 'version', 'out']);
    const [file] = positional;
    if (!file || !options.wallet || !options.version) {
      console.error('Usage: npm run profile -- build <trace.json> --wallet <name> --version <x.y.z> [--out <file>]');
      process.exit(1);
    }
    const profile = buildProfile(readTrace(file), {
      wallet: { name: options.wallet, version: options.version },
      recorded: { by: 'hand', date: new Date().toISOString() },
    });
    const json = `${JSON.stringify(profile, null, 2)}\n`;
    if (options.out) {
      fs.writeFileSync(options.out, json);
      console.log(`Profile written to ${options.out}`);
    } else {
      process.stdout.write(json);
    }
    return;
  }
  if (command === 'diff') {
    const [a, b] = args.slice(1);
    if (!a || !b) {
      console.error('Usage: npm run profile -- diff <a.json> <b.json>');
      process.exit(1);
    }
    process.stdout.write(diffProfiles(JSON.parse(fs.readFileSync(a, 'utf8')), JSON.parse(fs.readFileSync(b, 'utf8'))));
    return;
  }
  console.error('Usage: npm run profile -- build … | diff …');
  process.exit(1);
}

// The --name value options among `names`, and the other arguments in order
function parse(args: string[], names: string[]): { options: Record<string, string>; positional: string[] } {
  const options: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const name = args[i].startsWith('--') ? args[i].slice(2) : null;
    if (name && names.includes(name)) options[name] = args[++i];
    else positional.push(args[i]);
  }
  return { options, positional };
}

if (require.main === module) main(process.argv.slice(2));
```

- [ ] **Step 5: Write `scripts/profile.test.ts` for `readTrace`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTrace, type TraceChunk } from './profile';

const chunks: TraceChunk[] = [
  { recorder: '2', test: 'connectToDapp', entries: [{ kind: 'request', seq: 1, at: 10, method: 'eth_requestAccounts', result: ['0xabc'], ms: 5 }] },
  { recorder: '2', test: 'rejectSignature', entries: [{ kind: 'request', seq: 2, at: 20, method: 'personal_sign', error: { code: 4001 }, ms: 3 }] },
];

test('the trace is read as one chunk, a list of chunks, or one chunk per line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-profile-'));
  const one = path.join(dir, 'one.json');
  fs.writeFileSync(one, JSON.stringify(chunks[0]));
  assert.equal(readTrace(one).length, 1);
  const list = path.join(dir, 'list.json');
  fs.writeFileSync(list, JSON.stringify(chunks, null, 2));
  assert.equal(readTrace(list).length, 2);
  const lines = path.join(dir, 'lines.jsonl');
  fs.writeFileSync(lines, chunks.map((chunk) => JSON.stringify(chunk)).join('\n') + '\n');
  assert.equal(readTrace(lines).length, 2);
  const empty = path.join(dir, 'empty.jsonl');
  fs.writeFileSync(empty, '');
  assert.deepEqual(readTrace(empty), []);
});
```

- [ ] **Step 6: Run the tests**

Run: `npx tsx --test src/profile-build.test.ts scripts/profile.test.ts`
Expected: PASS, every test, `outcomeSet` included.

Run: `npm run check`
Expected: PASS. `scripts/conformance.ts` and `conformance/cypress/support/e2e.ts` still import from `scripts/profile.ts`, which re-exports everything.

Run: `npm run profile -- diff reports/profiles/metamask-13.50.0-headless.json reports/profiles/rabby-0.94.11.json | head -5`
Expected: the table's title, `# MetaMask 13.50.0 vs Rabby 0.94.11`, as before the move.

- [ ] **Step 7: Commit**

```bash
git add src/profile-build.ts src/profile-build.test.ts scripts/profile.ts scripts/profile.test.ts
git commit -m "Move the profile code into src, as pure functions the probe page can run"
```

---

### Task 3: Lint the probe page as browser code

**Files:**
- Modify: `eslint.config.mjs`

The `test` script gains `src/probe/*.test.ts` in Task 4 and `src/probe/page/*.test.ts` in Task 8, with the first test file of each folder: a glob that matches no file fails `tsx --test`.

- [ ] **Step 1: Give the page's files browser globals**

In `eslint.config.mjs`, after the line `{ files: ['conformance/recorder.js'], languageOptions: { globals: globals.browser } },` add:

```js
  // The probe page runs in the browser, bundled by scripts/build-probe.ts
  { files: ['src/probe/page/**/*.ts'], languageOptions: { globals: globals.browser } },
```

- [ ] **Step 2: Run the checks**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.mjs
git commit -m "Lint the probe page as browser code"
```

---

### Task 4: The flow, its verdicts and the trace's chunks

**Files:**
- Create: `src/probe/flow.ts`
- Test: `src/probe/flow.test.ts`
- Modify: `package.json` (the `test` script)

- [ ] **Step 1: Write the failing tests**

`src/probe/flow.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, classify, chunksOf, plainTrace, OTHER_ACCOUNT, type Context, type Outcome } from './flow';
import type { TraceChunk } from '../profile-schema';

const ACCOUNT = '0x7b6bae7788079d5fd02dfcbb20f2adb5eb43174a';
const context = (): Context => ({ anvilUrl: 'http://127.0.0.1:8545', account: ACCOUNT, token: '0x5fbdb2315678afecb367f032d93f642f64180aa3' });

test("the flow follows the conformance suite's order, method by method", () => {
  const methods = STEPS.map((step) => (step.request ? step.request(context()).method : `anvil: ${step.title}`));
  assert.deepEqual(methods, [
    'eth_requestAccounts',
    'eth_requestAccounts',
    'wallet_getPermissions',
    'wallet_getCapabilities',
    'wallet_getCapabilities',
    'wallet_getCapabilities',
    'wallet_requestPermissions',
    'wallet_requestPermissions',
    'personal_sign',
    'personal_sign',
    'eth_signTypedData_v4',
    'eth_signTypedData_v4',
    'eth_sendTransaction',
    'wallet_addEthereumChain',
    'wallet_addEthereumChain',
    'wallet_switchEthereumChain',
    'wallet_switchEthereumChain',
    'wallet_switchEthereumChain',
    'wallet_switchEthereumChain',
    'anvil: Fund the account and deploy a test token on Anvil',
    'wallet_sendCalls',
    'eth_sendTransaction',
    'wallet_watchAsset',
    'wallet_watchAsset',
    'eth_sendTransaction',
    'wallet_revokePermissions',
    'wallet_getPermissions',
  ]);
  assert.equal(new Set(STEPS.map((step) => step.title)).size, STEPS.length, 'one title per step');
});

test('each step that waits for the user says what to do and which prompt it is', () => {
  for (const step of STEPS) {
    if (step.expect === 'none') continue;
    assert.ok(step.decision, `${step.title} names its prompt`);
    assert.match(step.instruction, /(Accept|Reject) in your wallet/, step.title);
  }
});

test('the requests carry what the earlier steps found out', () => {
  const byTitle = (title: string) => STEPS.find((step) => step.title === title)!;
  const sign = byTitle('Sign a message, accepted').request!(context());
  // "Dappress probe", as UTF-8 hex
  assert.deepEqual(sign.params, ['0x44617070726573732070726f6265', ACCOUNT]);
  const approve = byTitle('Approve the token, accepted').request!(context());
  assert.equal((approve.params as { to: string }[])[0].to, context().token);
  assert.match((approve.params as { data: string }[])[0].data, new RegExp(`^0x095ea7b3${'0'.repeat(24)}${OTHER_ACCOUNT.slice(2)}`));
  // Without an account, a step that needs one cannot be sent
  assert.throws(() => byTitle('Sign a message, accepted').request!({ anvilUrl: 'http://127.0.0.1:8545' }), /No account: the connection was not accepted/);
});

test('the connection teaches the flow its account; the setup, its token', async () => {
  const connect = STEPS.find((step) => step.title === 'Connect, accepted')!;
  const learned: Context = { anvilUrl: 'http://127.0.0.1:8545' };
  connect.learn!(learned, { result: [ACCOUNT.toUpperCase().replace('0X', '0x')], asked: true });
  assert.equal(learned.account, ACCOUNT);
  const setup = STEPS.find((step) => step.setup)!;
  const calls: string[] = [];
  await setup.setup!(learned, {
    fund: async (account) => void calls.push(`fund ${account}`),
    deployToken: async (holder) => {
      calls.push(`deploy for ${holder}`);
      return '0x5fbdb2315678afecb367f032d93f642f64180aa3';
    },
  });
  assert.deepEqual(calls, [`fund ${ACCOUNT}`, `deploy for ${ACCOUNT}`]);
  assert.equal(learned.token, '0x5fbdb2315678afecb367f032d93f642f64180aa3');
});

test('the verdict on an outcome: as asked, without asking, or not as asked', () => {
  const accepted: Outcome = { result: ['0xabc'], asked: true };
  const rejected: Outcome = { error: { code: 4001, message: 'User rejected the request.' }, asked: true };
  const refused: Outcome = { error: { code: 4901, message: 'Not connected to the chain' }, asked: false };
  assert.equal(classify('accept', accepted), 'as-asked');
  assert.equal(classify('reject', rejected), 'as-asked');
  assert.equal(classify('reject', accepted), 'not-as-asked');
  assert.equal(classify('accept', rejected), 'not-as-asked');
  assert.equal(classify('accept', refused), 'without-asking');
  assert.equal(classify('reject', { result: null, asked: false }), 'without-asking');
  // An error after asking, other than the user's rejection, is what the wallet does
  assert.equal(classify('accept', { error: { code: -32000, message: 'insufficient funds' }, asked: true }), 'as-asked');
  assert.equal(classify('none', rejected), 'as-asked');
});

const entry = (seq: number, method: string) => ({ kind: 'request' as const, seq, at: seq, method, result: null, ms: 1 });

test('the trace splits into one chunk per step, the discovery on the last', () => {
  const trace: TraceChunk = {
    recorder: '2',
    discovery: { injected: 'before', flags: { isMetaMask: true }, eip6963: [] },
    entries: [entry(1, 'eth_requestAccounts'), entry(2, 'eth_chainId'), entry(3, 'personal_sign'), entry(4, 'eth_accounts')],
  };
  const chunks = chunksOf(trace, [
    { test: 'Connect, accepted', to: 2 },
    { test: 'Sign a message, accepted', to: 3 },
  ]);
  assert.deepEqual(
    chunks.map((chunk) => [chunk.test, chunk.entries.map((e) => e.seq), Boolean(chunk.discovery)]),
    [
      ['Connect, accepted', [1, 2], false],
      ['Sign a message, accepted', [3], false],
      ['After the flow', [4], true],
    ],
  );
});

test('the trace leaves the page as plain JSON: a BigInt as a hex quantity, a cycle refused', () => {
  const trace = { recorder: '2', entries: [{ ...entry(1, 'eth_getBalance'), result: 255n }] } as unknown as TraceChunk;
  assert.equal(plainTrace(trace).entries[0].kind === 'request' && plainTrace(trace).entries[0].result, '0xff');
  const cyclic = { recorder: '2', entries: [] } as unknown as TraceChunk & { self?: unknown };
  cyclic.self = cyclic;
  assert.throws(() => plainTrace(cyclic), /circular/i);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx tsx --test src/probe/flow.test.ts`
Expected: FAIL, `Cannot find module './flow'`.

- [ ] **Step 3: Write `src/probe/flow.ts`**

```ts
// The probe page's flow: the requests it sends the wallet, in the order of
// conformance/cypress/e2e/actions.cy.ts, so that a profile recorded here
// compares with the conformance ones request by request. It leaves out what
// only tests Dappress's commands: spending cap and gas options, accounts,
// locking. Pure: the page runs it, and the unit tests run it on a fake.

import type { TraceChunk } from '../profile-schema';

/** The wallet's prompt a step waits for, by the name the end-to-end run picks Dappress's command with. */
export type Decision = 'connection' | 'signature' | 'transaction' | 'network' | 'switch' | 'token';
/** What the user is asked to do in the wallet; `none` when the wallet answers alone. */
export type Expect = 'accept' | 'reject' | 'none';

/** What the earlier steps found out. */
export interface Context {
  anvilUrl: string;
  account?: string;
  token?: string;
}

/** What a request came back with, and whether the wallet put it to the user (it was still pending after ASKING_AFTER). */
export type Outcome = ({ result: unknown } | { error: { code?: unknown; message?: string } }) & { asked: boolean };

/** What a step does on Anvil rather than through the wallet: the page passes the real one, the tests a fake. */
export interface AnvilClient {
  fund(account: string): Promise<void>;
  deployToken(holder: string): Promise<string>;
}

export interface Step {
  title: string;
  /** What the page shows while the step runs. */
  instruction: string;
  expect: Expect;
  decision?: Decision;
  /** The request to send, from what the earlier steps found out. */
  request?(context: Context): { method: string; params?: unknown };
  /** What the step does on Anvil, not through the wallet. */
  setup?(context: Context, anvil: AnvilClient): Promise<void>;
  /** What the outcome tells the next steps. */
  learn?(context: Context, outcome: Outcome): void;
}

/** A request still pending after this was put to the user: a wallet answers what it decides alone at once. */
export const ASKING_AFTER = 500;
export const USER_REJECTED = 4001;

// An account the dapp is never connected with, and the chains of the conformance suite
export const OTHER_ACCOUNT = '0x000000000000000000000000000000000000dead';
const ANVIL_CHAIN = '0x7a69';
const HOODI = '0x88bb0';
const SEPOLIA = '0xaa36a7';
const UNKNOWN_CHAIN = '0x1234';
const UNREACHABLE = {
  chainId: '0x539',
  chainName: 'Unreachable',
  rpcUrls: ['http://127.0.0.1:8546'],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};
const anvilChain = (context: Context) => ({
  chainId: ANVIL_CHAIN,
  chainName: 'Anvil',
  rpcUrls: [context.anvilUrl],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
});

const MESSAGE = 'Dappress probe';
const hexOf = (text: string) => `0x${[...new TextEncoder().encode(text)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
// EIP-712 without a chain id in its domain: the wallet may be on any chain at that step
const TYPED_DATA = JSON.stringify({
  types: { EIP712Domain: [{ name: 'name', type: 'string' }], Probe: [{ name: 'contents', type: 'string' }] },
  primaryType: 'Probe',
  domain: { name: MESSAGE },
  message: { contents: MESSAGE },
});
const word = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const ONE_TOKEN = (10n ** 18n).toString(16);

function accountOf(context: Context): string {
  if (!context.account) throw new Error('No account: the connection was not accepted');
  return context.account;
}

function tokenOf(context: Context): string {
  if (!context.token) throw new Error('No token: the setup on Anvil did not run');
  return context.token;
}

const ACCEPT = 'Accept in your wallet.';
const REJECT = 'Reject in your wallet.';
const ALONE = 'Your wallet should answer alone: nothing to do.';

export const STEPS: Step[] = [
  { title: 'Connect, rejected', instruction: REJECT, expect: 'reject', decision: 'connection', request: () => ({ method: 'eth_requestAccounts' }) },
  {
    title: 'Connect, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'connection',
    request: () => ({ method: 'eth_requestAccounts' }),
    learn: (context, outcome) => {
      const accounts = 'result' in outcome && Array.isArray(outcome.result) ? (outcome.result as string[]) : [];
      if (accounts[0]) context.account = accounts[0].toLowerCase();
    },
  },
  { title: 'Read the permissions', instruction: ALONE, expect: 'none', request: () => ({ method: 'wallet_getPermissions' }) },
  { title: 'Read the capabilities', instruction: ALONE, expect: 'none', request: (c) => ({ method: 'wallet_getCapabilities', params: [accountOf(c)] }) },
  {
    title: 'Read the capabilities of one chain',
    instruction: ALONE,
    expect: 'none',
    request: (c) => ({ method: 'wallet_getCapabilities', params: [accountOf(c), [HOODI]] }),
  },
  {
    title: 'Read the capabilities of an account not connected',
    instruction: ALONE,
    expect: 'none',
    request: () => ({ method: 'wallet_getCapabilities', params: [OTHER_ACCOUNT] }),
  },
  {
    title: 'Ask for the permissions again, rejected',
    instruction: REJECT,
    expect: 'reject',
    decision: 'connection',
    request: () => ({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }),
  },
  {
    title: 'Ask for the permissions again, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'connection',
    request: () => ({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }),
  },
  {
    title: 'Sign a message, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'signature',
    request: (c) => ({ method: 'personal_sign', params: [hexOf(MESSAGE), accountOf(c)] }),
  },
  {
    title: 'Sign a message, rejected',
    instruction: REJECT,
    expect: 'reject',
    decision: 'signature',
    request: (c) => ({ method: 'personal_sign', params: [hexOf(MESSAGE), accountOf(c)] }),
  },
  {
    title: 'Sign typed data, rejected',
    instruction: REJECT,
    expect: 'reject',
    decision: 'signature',
    request: (c) => ({ method: 'eth_signTypedData_v4', params: [accountOf(c), TYPED_DATA] }),
  },
  {
    title: 'Sign typed data, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'signature',
    request: (c) => ({ method: 'eth_signTypedData_v4', params: [accountOf(c), TYPED_DATA] }),
  },
  {
    title: 'Send a transaction, rejected',
    instruction: REJECT,
    expect: 'reject',
    decision: 'transaction',
    request: (c) => ({ method: 'eth_sendTransaction', params: [{ from: accountOf(c), to: OTHER_ACCOUNT, value: '0x0' }] }),
  },
  {
    title: 'Add a network, rejected',
    instruction: REJECT,
    expect: 'reject',
    decision: 'network',
    request: () => ({ method: 'wallet_addEthereumChain', params: [UNREACHABLE] }),
  },
  {
    title: 'Add Anvil, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'network',
    request: (c) => ({ method: 'wallet_addEthereumChain', params: [anvilChain(c)] }),
  },
  {
    title: 'Switch to Sepolia, rejected',
    instruction: REJECT,
    expect: 'reject',
    decision: 'switch',
    request: () => ({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA }] }),
  },
  {
    title: 'Switch to Sepolia, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'switch',
    request: () => ({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA }] }),
  },
  {
    title: 'Switch to a chain the wallet does not know',
    instruction: ALONE,
    expect: 'none',
    request: () => ({ method: 'wallet_switchEthereumChain', params: [{ chainId: UNKNOWN_CHAIN }] }),
  },
  {
    title: 'Switch back to Anvil',
    instruction: `${ACCEPT} Most wallets switch without asking.`,
    expect: 'accept',
    decision: 'switch',
    request: () => ({ method: 'wallet_switchEthereumChain', params: [{ chainId: ANVIL_CHAIN }] }),
  },
  {
    title: 'Fund the account and deploy a test token on Anvil',
    instruction: 'The page funds your account and deploys a token on Anvil: nothing to do.',
    expect: 'none',
    setup: async (context, anvil) => {
      const account = accountOf(context);
      await anvil.fund(account);
      context.token = await anvil.deployToken(account);
    },
  },
  {
    title: 'Send a batch of calls',
    instruction: `${ACCEPT} A wallet that cannot batch on Anvil refuses alone.`,
    expect: 'accept',
    decision: 'transaction',
    request: (c) => ({
      method: 'wallet_sendCalls',
      params: [
        {
          version: '2.0.0',
          chainId: ANVIL_CHAIN,
          from: accountOf(c),
          atomicRequired: false,
          calls: [
            { to: OTHER_ACCOUNT, value: '0x1' },
            { to: OTHER_ACCOUNT, value: '0x2' },
          ],
        },
      ],
    }),
  },
  {
    title: 'Send a transaction, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'transaction',
    request: (c) => ({ method: 'eth_sendTransaction', params: [{ from: accountOf(c), to: OTHER_ACCOUNT, value: '0x1' }] }),
  },
  {
    title: 'Watch the token, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'token',
    request: (c) => ({ method: 'wallet_watchAsset', params: { type: 'ERC20', options: { address: tokenOf(c), symbol: 'DPROBE', decimals: 18 } } }),
  },
  {
    title: 'Watch the token, rejected',
    instruction: REJECT,
    expect: 'reject',
    decision: 'token',
    request: (c) => ({ method: 'wallet_watchAsset', params: { type: 'ERC20', options: { address: tokenOf(c), symbol: 'DPROBE', decimals: 18 } } }),
  },
  {
    title: 'Approve the token, accepted',
    instruction: ACCEPT,
    expect: 'accept',
    decision: 'transaction',
    request: (c) => ({
      method: 'eth_sendTransaction',
      params: [{ from: accountOf(c), to: tokenOf(c), data: `0x095ea7b3${word(OTHER_ACCOUNT)}${word(ONE_TOKEN)}` }],
    }),
  },
  { title: 'Revoke the permissions', instruction: ALONE, expect: 'none', request: () => ({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }) },
  { title: 'Read the permissions once revoked', instruction: ALONE, expect: 'none', request: () => ({ method: 'wallet_getPermissions' }) },
];

export type Verdict = 'as-asked' | 'without-asking' | 'not-as-asked';

/**
 * Whether the outcome is the one the step asked the user for. A wallet that
 * answers without putting the request to the user decided alone: what it does,
 * worth recording, and the flow goes on. An acceptance where a rejection was
 * asked, or the other way round, is the user's slip: the page offers to redo it.
 */
export function classify(expect: Expect, outcome: Outcome): Verdict {
  if (expect === 'none') return 'as-asked';
  if (!outcome.asked) return 'without-asking';
  const rejected = 'error' in outcome && outcome.error.code === USER_REJECTED;
  if (expect === 'reject' && 'result' in outcome) return 'not-as-asked';
  if (expect === 'accept' && rejected) return 'not-as-asked';
  return 'as-asked';
}

/** Where a step ended in the trace: the entries before `to`, and after the step before, are its. */
export interface Mark {
  test: string;
  to: number;
}

/**
 * The trace as one chunk per step, named after it, and a last one with what
 * came after the flow and the discovery: buildProfile() takes the last.
 */
export function chunksOf(trace: TraceChunk, marks: Mark[]): TraceChunk[] {
  const chunks: TraceChunk[] = [];
  let from = 0;
  for (const mark of marks) {
    chunks.push({ recorder: trace.recorder, test: mark.test, entries: trace.entries.slice(from, mark.to) });
    from = mark.to;
  }
  chunks.push({ recorder: trace.recorder, test: 'After the flow', discovery: trace.discovery, entries: trace.entries.slice(from) });
  return chunks;
}

/** The trace as plain JSON, as a file holds it: a BigInt as a hex quantity. A cycle throws. */
export function plainTrace(trace: TraceChunk): TraceChunk {
  return JSON.parse(JSON.stringify(trace, (_key, value: unknown) => (typeof value === 'bigint' ? `0x${value.toString(16)}` : value))) as TraceChunk;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test src/probe/flow.test.ts`
Expected: PASS, 7 tests.

In `package.json`, add `src/probe/*.test.ts` to the `test` script, after `src/*.test.ts`:

```json
"test": "tsx --test src/*.test.ts src/probe/*.test.ts scripts/*.test.ts conformance/*.test.ts",
```

Run: `npm run check`
Expected: PASS, the flow's tests among them.

- [ ] **Step 5: Commit**

```bash
git add src/probe/flow.ts src/probe/flow.test.ts package.json
git commit -m "Write the probe page's flow: the steps, the verdict on each outcome, the trace by step"
```

---

### Task 5: Start and stop Anvil

**Files:**
- Create: `src/probe/anvil.ts`
- Test: `src/probe/anvil.test.ts`
- Modify: `scripts/conformance.ts` (use `foundry()` from it)

- [ ] **Step 1: Write the failing tests**

`src/probe/anvil.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { startAnvil, isListening } from './anvil';

/** A port something listens on, for as long as the test needs it. */
async function takenPort(): Promise<{ port: number; release: () => Promise<void> }> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return { port, release: () => new Promise((resolve) => server.close(() => resolve())) };
}

test('a port something listens on is taken, a free one is not', async () => {
  const { port, release } = await takenPort();
  assert.equal(await isListening(port), true);
  await release();
  assert.equal(await isListening(port), false);
});

test("Anvil is never started over a node that already listens: it may be the user's own", async () => {
  const { port, release } = await takenPort();
  try {
    await assert.rejects(startAnvil({ port }), new RegExp(`Something already listens on 127\\.0\\.0\\.1:${port}: stop it, or pass --anvil-port`));
  } finally {
    await release();
  }
});

test('without Anvil, the error says how to install it', async () => {
  const { port, release } = await takenPort();
  await release();
  await assert.rejects(startAnvil({ port, binary: '/nonexistent/anvil' }), /Anvil is not installed\. It is part of Foundry: getfoundry\.sh/);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx tsx --test src/probe/anvil.test.ts`
Expected: FAIL, `Cannot find module './anvil'`.

- [ ] **Step 3: Write `src/probe/anvil.ts`**

```ts
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
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' });
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
  child.once('exit', (code) => {
    failure ??= new Error(`[dappress] Anvil stopped as it started, with code ${String(code)}`);
  });
  for (let attempt = 0; attempt < START_ATTEMPTS && !failure; attempt++) {
    if (await answers(url)) return { url, stop: () => void child.kill() };
    await new Promise((resolve) => setTimeout(resolve, POLL));
  }
  child.kill();
  throw failure ?? new Error(`[dappress] Anvil did not answer on ${url}`);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test src/probe/anvil.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Use `foundry()` in the conformance script**

In `scripts/conformance.ts`:
- Add the import `import { foundry } from '../src/probe/anvil';` after the import of `../src/wallet-profile`.
- Delete its own `function foundry(tool: string): string { … }` (three lines of body and the closing brace).

Run: `npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/probe/anvil.ts src/probe/anvil.test.ts scripts/conformance.ts
git commit -m "Start Anvil for the probe page on the loopback, never over a node already there"
```

---

### Task 6: The read-only server of the page

**Files:**
- Create: `src/probe/server.ts`
- Test: `src/probe/server.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/probe/server.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { startProbeServer, PAGE_FILES, type ProbeServer } from './server';
import { SCHEMA, type Profile } from '../profile-schema';

const reference: Profile = {
  schema: SCHEMA,
  wallet: { name: 'MetaMask', version: '13.50.0' },
  recorded: { by: 'test', date: '2026-10-12', recorder: '2' },
  discovery: null,
  methods: {},
  events: {},
};

function pageRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dappress-probe-'));
  for (const file of Object.values(PAGE_FILES)) fs.writeFileSync(path.join(root, file.name), `/* ${file.name} */`);
  fs.writeFileSync(path.join(root, 'secret.txt'), 'not served');
  return root;
}

async function withServer(run: (server: ProbeServer) => Promise<void>): Promise<void> {
  const server = await startProbeServer({ root: pageRoot(), anvilUrl: 'http://127.0.0.1:8545', reference, dappressVersion: '0.11.0' });
  try {
    await run(server);
  } finally {
    await server.close();
  }
}

/** A raw request, with the Host header and the path exactly as given: fetch() would normalise both. */
function request(server: ProbeServer, { method = 'GET', target = '/', host }: { method?: string; target?: string; host?: string } = {}) {
  const { port } = new URL(server.url);
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: target, headers: { host: host ?? `127.0.0.1:${port}` } }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the page, its script, its style and the recorder are served, with their types', async () => {
  await withServer(async (server) => {
    for (const [route, file] of Object.entries(PAGE_FILES)) {
      const response = await request(server, { target: route });
      assert.equal(response.status, 200, route);
      assert.equal(response.headers['content-type'], file.type, route);
      assert.equal(response.body, `/* ${file.name} */`, route);
    }
  });
});

test("the page's config and the reference profile are served as JSON", async () => {
  await withServer(async (server) => {
    const config = await request(server, { target: '/config.json' });
    assert.deepEqual(JSON.parse(config.body), { anvilUrl: 'http://127.0.0.1:8545', dappressVersion: '0.11.0' });
    const profile = await request(server, { target: '/reference-profile.json' });
    assert.equal(JSON.parse(profile.body).wallet.name, 'MetaMask');
  });
});

test('nothing else is served: no other file, no way up the tree', async () => {
  await withServer(async (server) => {
    for (const target of ['/secret.txt', '/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/index.html/..', '//etc/passwd', '/probe.js?x=../secret.txt']) {
      const response = await request(server, { target });
      if (target.startsWith('/probe.js?')) assert.equal(response.status, 200, target);
      else assert.equal(response.status, 404, target);
      assert.ok(!response.body.includes('not served'), target);
    }
  });
});

test('only GET and HEAD are answered', async () => {
  await withServer(async (server) => {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
      const response = await request(server, { method });
      assert.equal(response.status, 405, method);
      assert.equal(response.headers.allow, 'GET, HEAD', method);
    }
    const head = await request(server, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
  });
});

test('a request for another host is refused: a site pointing its own name at the machine reads nothing', async () => {
  await withServer(async (server) => {
    const { port } = new URL(server.url);
    assert.equal((await request(server, { host: 'evil.example' })).status, 403);
    assert.equal((await request(server, { host: `evil.example:${port}` })).status, 403);
    assert.equal((await request(server, { host: `localhost:${port}` })).status, 200);
  });
});

test('every answer carries the security headers, the policy naming Anvil', async () => {
  await withServer(async (server) => {
    for (const target of ['/', '/missing']) {
      const { headers } = await request(server, { target });
      assert.equal(
        headers['content-security-policy'],
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:8545; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      assert.equal(headers['x-content-type-options'], 'nosniff');
      assert.equal(headers['referrer-policy'], 'no-referrer');
      assert.equal(headers['cache-control'], 'no-store');
    }
  });
});

test('the server listens on the loopback only, on a port of its own', async () => {
  await withServer(async (server) => {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  });
});

test('a page file missing from the build fails the start, not a later request', async () => {
  const root = pageRoot();
  fs.rmSync(path.join(root, 'probe.js'));
  await assert.rejects(
    startProbeServer({ root, anvilUrl: 'http://127.0.0.1:8545', reference, dappressVersion: '0.11.0' }),
    /The probe page is not built: probe\.js is missing/,
  );
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx tsx --test src/probe/server.test.ts`
Expected: FAIL, `Cannot find module './server'`.

- [ ] **Step 3: Write `src/probe/server.ts`**

```ts
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
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function end(response: http.ServerResponse, status: number): void {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(http.STATUS_CODES[status]);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test src/probe/server.test.ts`
Expected: PASS, 8 tests.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/probe/server.ts src/probe/server.test.ts
git commit -m "Serve the probe page from memory, to the loopback only, and nothing else"
```

---

### Task 7: The command, `dappress probe`

**Files:**
- Create: `src/probe/command.ts`, `src/cli.ts`
- Test: `src/probe/command.test.ts`
- Modify: `package.json` (`bin`)

- [ ] **Step 1: Write the failing tests**

`src/probe/command.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, runCli, USAGE, type CliDeps } from './command';

function fakes(overrides: Partial<CliDeps> = {}) {
  const calls: string[] = [];
  const output: string[] = [];
  let stop: (() => void) | undefined;
  const deps: CliDeps = {
    startAnvil: async ({ port }) => {
      calls.push(`anvil ${port}`);
      return { url: `http://127.0.0.1:${port}`, stop: () => void calls.push('anvil stopped') };
    },
    startServer: async ({ anvilUrl }) => {
      calls.push(`server for ${anvilUrl}`);
      return { url: 'http://127.0.0.1:50123/', close: async () => void calls.push('server closed') };
    },
    log: (line) => void output.push(line),
    error: (line) => void output.push(`error: ${line}`),
    onStop: (handler) => {
      stop = handler;
    },
    ...overrides,
  };
  return { deps, calls, output, stop: () => stop?.() };
}

test('the arguments: probe, and the port of Anvil', () => {
  assert.deepEqual(parseArgs(['probe']), { command: 'probe', anvilPort: 8545 });
  assert.deepEqual(parseArgs(['probe', '--anvil-port', '9545']), { command: 'probe', anvilPort: 9545 });
  assert.deepEqual(parseArgs([]), { error: USAGE });
  assert.deepEqual(parseArgs(['record']), { error: `Unknown command "record".\n\n${USAGE}` });
  assert.deepEqual(parseArgs(['probe', '--anvil-port', 'x']), { error: `--anvil-port takes a port number, not "x".\n\n${USAGE}` });
  assert.deepEqual(parseArgs(['probe', '--open']), { error: `Unknown option "--open".\n\n${USAGE}` });
});

test('without a command, the usage, and a failure', async () => {
  const { deps, output } = fakes();
  assert.equal(await runCli([], deps), 1);
  assert.deepEqual(output, [`error: ${USAGE}`]);
});

test('probe starts Anvil, then the page for it, and says where to go and what not to use', async () => {
  const { deps, calls, output } = fakes();
  assert.equal(await runCli(['probe'], deps), undefined);
  assert.deepEqual(calls, ['anvil 8545', 'server for http://127.0.0.1:8545']);
  const said = output.join('\n');
  assert.match(said, /Open http:\/\/127\.0\.0\.1:50123\/ in the browser where the wallet to record is installed/);
  assert.match(said, /Use a test wallet: the profile holds its addresses and signatures/);
});

test('stopping the command closes the page and stops Anvil', async () => {
  const { deps, calls, stop } = fakes();
  await runCli(['probe'], deps);
  stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls.slice(2), ['server closed', 'anvil stopped']);
});

test("Anvil that cannot start: its message, a failure, and no page", async () => {
  const { deps, calls, output } = fakes({
    startAnvil: async () => {
      throw new Error('[dappress] Anvil is not installed. It is part of Foundry: getfoundry.sh');
    },
  });
  assert.equal(await runCli(['probe'], deps), 1);
  assert.deepEqual(calls, []);
  assert.deepEqual(output, ['error: [dappress] Anvil is not installed. It is part of Foundry: getfoundry.sh']);
});

test('a page that cannot start stops Anvil', async () => {
  const { deps, calls, output } = fakes({
    startServer: async () => {
      throw new Error('[dappress] The probe page is not built: probe.js is missing from dist/probe');
    },
  });
  assert.equal(await runCli(['probe'], deps), 1);
  assert.deepEqual(calls, ['anvil 8545', 'anvil stopped']);
  assert.match(output.join('\n'), /The probe page is not built/);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx tsx --test src/probe/command.test.ts`
Expected: FAIL, `Cannot find module './command'`.

- [ ] **Step 3: Write `src/probe/command.ts`**

```ts
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
  let server: ProbeServer;
  try {
    server = await deps.startServer({ anvilUrl: anvil.url });
  } catch (error) {
    anvil.stop();
    deps.error((error as Error).message);
    return 1;
  }
  deps.onStop(() => {
    void server.close().finally(() => anvil.stop());
  });
  deps.log(`[dappress] Anvil runs on ${anvil.url}, for this session only.`);
  deps.log(`[dappress] Open ${server.url} in the browser where the wallet to record is installed, and follow the page.`);
  deps.log('[dappress] Use a test wallet: the profile holds its addresses and signatures, and is made to be shared.');
  deps.log('[dappress] Ctrl+C stops the page and Anvil.');
  return undefined;
}
```

- [ ] **Step 4: Write `src/cli.ts`**

```ts
#!/usr/bin/env node
// The `dappress` command of the package's bin: `npx dappress probe`.
import { runCli } from './probe/command';

void runCli(process.argv.slice(2)).then((code) => {
  if (code !== undefined) process.exitCode = code;
});
```

- [ ] **Step 5: Declare the bin**

In `package.json`, after `"types": "dist/index.d.ts",` add:

```json
  "bin": {
    "dappress": "dist/cli.js"
  },
```

- [ ] **Step 6: Run the tests**

Run: `npx tsx --test src/probe/command.test.ts`
Expected: PASS, 6 tests.

Run: `npm run check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/probe/command.ts src/probe/command.test.ts src/cli.ts package.json
git commit -m "Add the dappress command: probe starts Anvil and the page, and stops them together"
```

---

### Task 8: The test token, and the page's calls to Anvil

**Files:**
- Create: `src/probe/TestToken.sol`, `src/probe/page/token.ts` (generated), `src/probe/page/anvil-client.ts`
- Test: `src/probe/page/anvil-client.test.ts`
- Modify: `package.json` (the `test` script)

- [ ] **Step 1: Write the token's source**

`src/probe/TestToken.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// The probe page's token: enough of ERC-20 for a wallet to watch it and for
/// an approval to go through. Compiled once into src/probe/page/token.ts
/// (CONTRIBUTING.md says how), deployed on the session's Anvil.
contract TestToken {
    string public constant name = "Dappress Probe";
    string public constant symbol = "DPROBE";
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(address holder) {
        totalSupply = 1000 ether;
        balanceOf[holder] = totalSupply;
        emit Transfer(address(0), holder, totalSupply);
    }

    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        allowance[from][msg.sender] -= value;
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
        return true;
    }
}
```

- [ ] **Step 2: Compile it once into `src/probe/page/token.ts`**

Run, from the repository's root:

```bash
work=$(mktemp -d) && mkdir "$work/src" && cp src/probe/TestToken.sol "$work/src/" \
  && (cd "$work" && ~/.foundry/bin/forge build --use 0.8.28 --optimize --no-metadata --root . >/dev/null) \
  && node -e '
const fs = require("fs");
const artifact = JSON.parse(fs.readFileSync(process.argv[1] + "/out/TestToken.sol/TestToken.json", "utf8"));
const bytecode = artifact.bytecode.object;
if (!/^0x[0-9a-f]+$/.test(bytecode)) throw new Error("no bytecode");
fs.writeFileSync("src/probe/page/token.ts",
`// The creation bytecode of src/probe/TestToken.sol, compiled with solc 0.8.28,
// optimised, without metadata. CONTRIBUTING.md says how to compile it again.
// Its constructor takes the address the whole supply goes to.
export const TOKEN_BYTECODE =
  "${bytecode}";
`);' "$work" && npx prettier --write src/probe/page/token.ts
```

Expected: `src/probe/page/token.ts` exists, and `grep -c '^  "0x' src/probe/page/token.ts` prints `1`. If `--no-metadata` is refused by this Forge version, drop it: the bytecode then ends with a metadata hash, which changes nothing for the page.

- [ ] **Step 3: Write the failing tests**

`src/probe/page/anvil-client.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anvilClient } from './anvil-client';
import { TOKEN_BYTECODE } from './token';

const ACCOUNT = '0x7b6bae7788079d5fd02dfcbb20f2adb5eb43174a';
const DEPLOYER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const TOKEN = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

function fakeAnvil(answers: Record<string, (params: unknown[]) => unknown>) {
  const sent: { url: string; method: string; params: unknown[] }[] = [];
  const fetcher = (async (url: string, init: { body: string }) => {
    const { id, method, params } = JSON.parse(init.body) as { id: number; method: string; params: unknown[] };
    sent.push({ url, method, params });
    const answer = answers[method];
    const body = answer ? { jsonrpc: '2.0', id, result: answer(params) } : { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  return { sent, fetcher };
}

test("funding sets the account's balance on Anvil, a hundred ether", async () => {
  const { sent, fetcher } = fakeAnvil({ anvil_setBalance: () => null });
  await anvilClient('http://127.0.0.1:8545', fetcher).fund(ACCOUNT);
  assert.deepEqual(sent, [{ url: 'http://127.0.0.1:8545', method: 'anvil_setBalance', params: [ACCOUNT, '0x56bc75e2d63100000'] }]);
});

test("the token is deployed from Anvil's first account, its supply to the holder, and its address yielded", async () => {
  const { sent, fetcher } = fakeAnvil({
    eth_accounts: () => [DEPLOYER],
    eth_sendTransaction: () => '0xhash',
    eth_getTransactionReceipt: () => ({ status: '0x1', contractAddress: TOKEN }),
  });
  assert.equal(await anvilClient('http://127.0.0.1:8545', fetcher).deployToken(ACCOUNT), TOKEN.toLowerCase());
  const deploy = sent.find((call) => call.method === 'eth_sendTransaction')!;
  const transaction = deploy.params[0] as { from: string; data: string };
  assert.equal(transaction.from, DEPLOYER);
  assert.equal(transaction.data, `${TOKEN_BYTECODE}${'0'.repeat(24)}${ACCOUNT.slice(2)}`);
});

test("Anvil's error, or a deployment that failed, says so", async () => {
  const { fetcher } = fakeAnvil({});
  await assert.rejects(anvilClient('http://127.0.0.1:8545', fetcher).fund(ACCOUNT), /Anvil answered -32601 "Method not found: anvil_setBalance"/);
  const { fetcher: reverted } = fakeAnvil({
    eth_accounts: () => [DEPLOYER],
    eth_sendTransaction: () => '0xhash',
    eth_getTransactionReceipt: () => ({ status: '0x0', contractAddress: null }),
  });
  await assert.rejects(anvilClient('http://127.0.0.1:8545', reverted).deployToken(ACCOUNT), /The test token was not deployed/);
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx tsx --test src/probe/page/anvil-client.test.ts`
Expected: FAIL, `Cannot find module './anvil-client'`.

- [ ] **Step 5: Write `src/probe/page/anvil-client.ts`**

```ts
// What the probe page does on Anvil itself, not through the wallet: fund the
// connected account, and deploy the test token. Anvil mines each transaction
// as it comes, so a receipt is there as soon as the hash is.

import { TOKEN_BYTECODE } from './token';
import type { AnvilClient } from '../flow';

// A hundred ether, in wei
const BALANCE = `0x${(100n * 10n ** 18n).toString(16)}`;

export function anvilClient(url: string, fetcher: typeof fetch = fetch): AnvilClient {
  let id = 0;
  async function call<T>(method: string, params: unknown[] = []): Promise<T> {
    const response = await fetcher(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    const body = (await response.json()) as { result?: T; error?: { code: number; message: string } };
    if (body.error) throw new Error(`Anvil answered ${body.error.code} "${body.error.message}" to ${method}`);
    return body.result as T;
  }
  return {
    fund: async (account) => {
      await call('anvil_setBalance', [account, BALANCE]);
    },
    deployToken: async (holder) => {
      const [deployer] = await call<string[]>('eth_accounts');
      const data = `${TOKEN_BYTECODE}${holder.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
      const hash = await call<string>('eth_sendTransaction', [{ from: deployer, data }]);
      const receipt = await call<{ status: string; contractAddress: string | null } | null>('eth_getTransactionReceipt', [hash]);
      if (!receipt || receipt.status !== '0x1' || !receipt.contractAddress) throw new Error('The test token was not deployed on Anvil');
      return receipt.contractAddress.toLowerCase();
    },
  };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx tsx --test src/probe/page/anvil-client.test.ts`
Expected: PASS, 3 tests.

Then check the bytecode against a real Anvil once:

```bash
anvil --silent --port 8599 & sleep 2
npx tsx -e "
import { anvilClient } from './src/probe/page/anvil-client';
anvilClient('http://127.0.0.1:8599').deployToken('0x7b6bae7788079d5fd02dfcbb20f2adb5eb43174a').then((t) => console.log('token', t));
"
kill %1
```

Expected: `token 0x…` (an address).

In `package.json`, add `src/probe/page/*.test.ts` to the `test` script, after `src/probe/*.test.ts`:

```json
"test": "tsx --test src/*.test.ts src/probe/*.test.ts src/probe/page/*.test.ts scripts/*.test.ts conformance/*.test.ts",
```

Run `npm run check`: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/probe/TestToken.sol src/probe/page/token.ts src/probe/page/anvil-client.ts src/probe/page/anvil-client.test.ts package.json
git commit -m "Add the probe page's test token, and its calls to Anvil: fund the account, deploy the token"
```

---

### Task 9: The page

**Files:**
- Create: `src/probe/page/index.html`, `src/probe/page/style.css`, `src/probe/page/main.ts`

The page's logic is in `flow.ts` and `anvil-client.ts`, tested above. `main.ts` wires them to the DOM. It writes text with `textContent` only, never `innerHTML`: a wallet's name and the outcomes come from the extension and the wallet, not from us.

- [ ] **Step 1: Write `src/probe/page/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dappress probe</title>
    <!-- First, before anything else: it sees each provider as it turns up -->
    <script src="/recorder.js"></script>
    <link rel="stylesheet" href="/style.css" />
    <script src="/probe.js" defer></script>
  </head>
  <body>
    <main id="probe" data-state="loading">
      <h1>Record a wallet profile</h1>
      <p>
        This page sends your wallet the requests a dapp sends, one by one, and records what it answers. The profile it builds is what a Dappress mock
        replays.
      </p>
      <p class="warning">Use a test wallet. The profile holds its addresses and the signatures you make here, and it is made to be shared.</p>

      <section id="choose" hidden>
        <h2>1. The wallet</h2>
        <ul id="wallets"></ul>
        <p id="no-wallet" class="warning" hidden>No wallet found in this page. Install or enable one, then reload.</p>
        <p id="others" class="warning" hidden></p>
        <label for="version">Its version, as its settings or its extension page show it</label>
        <input id="version" placeholder="0.95.0" autocomplete="off" spellcheck="false" />
        <button id="start" type="button" disabled>Start</button>
      </section>

      <section id="run" hidden>
        <h2>2. The requests</h2>
        <p id="instruction" aria-live="polite"></p>
        <div id="not-as-asked" hidden>
          <p id="mismatch"></p>
          <button id="redo" type="button">Do it again</button>
          <button id="keep" type="button">Keep it and go on</button>
        </div>
        <button id="skip" type="button" disabled>Skip this step</button>
        <ol id="steps"></ol>
      </section>

      <section id="done" hidden>
        <h2>3. The profile</h2>
        <p id="summary"></p>
        <button id="download" type="button">Download the profile</button>
        <p>Run your tests against it with <code id="usage"></code> in <code>configureDappress()</code>.</p>
        <p>
          To share it, open a pull request adding it to <code>reports/profiles/</code> of github.com/blassaut/dappress. Check it holds nothing you would
          not publish.
        </p>
        <h3>Where it differs from MetaMask</h3>
        <pre id="diff"></pre>
      </section>

      <p id="failure" class="warning" hidden></p>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Write `src/probe/page/style.css`**

```css
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
  line-height: 1.5;
}
main {
  max-width: 46rem;
  margin: 2rem auto;
  padding: 0 1rem;
}
.warning {
  border-left: 0.25rem solid #d97706;
  padding-left: 0.75rem;
}
#wallets {
  list-style: none;
  padding: 0;
}
#wallets label {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
#wallets img {
  width: 1.5rem;
  height: 1.5rem;
}
input,
button {
  font: inherit;
  margin: 0.25rem 0.5rem 0.25rem 0;
}
#instruction {
  font-size: 1.25rem;
  font-weight: 600;
}
#steps li[data-verdict='not-as-asked'] {
  color: #b91c1c;
}
#steps .outcome {
  display: block;
  font-family: ui-monospace, monospace;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
pre {
  overflow-x: auto;
  font-size: 0.8rem;
}
```

- [ ] **Step 3: Write `src/probe/page/main.ts`**

```ts
// The probe page: choose the wallet, send it the flow's requests one by one,
// then build its profile, compare it with MetaMask's and download it. The
// recorder (recorder.js, loaded first) records everything the wallet answers;
// this file only asks and shows. Text goes in with textContent: a wallet's
// name and its answers are not ours.
//
// The end-to-end run reads data-state, data-decision and data-expect on
// #probe to answer each prompt with Dappress's commands, and the profile on
// window.dappressProbe.

import { buildProfile, diffProfiles, type Profile, type TraceChunk } from '../../profile-build';
import { STEPS, ASKING_AFTER, classify, chunksOf, plainTrace, type Context, type Mark, type Outcome, type Step } from '../flow';
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
    ethereum?: Provider;
    dappressProbe?: { profile: Profile };
  }
}

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const probe = element('probe');
const VERSION = /^\d+(\.\d+){1,3}$/;
// How long the wallets have to announce themselves (EIP-6963) once asked
const DISCOVERY = 500;

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
  if (!announced.length && window.ethereum) announced.push({ info: { name: 'window.ethereum' }, provider: window.ethereum });
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
      const injectedElsewhere = window.ethereum !== undefined && window.ethereum !== wallet.provider;
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
      const otherWallets = wallets.length > 1 || (window.ethereum !== undefined && window.ethereum !== chosen!.provider);
      resolve({ wallet: chosen!, version: version.value.trim(), otherWallets });
    }),
  );
}

/** What an outcome says, for the list of steps. */
function describeOutcome(outcome: Outcome | undefined): string {
  if (!outcome) return 'skipped';
  if ('error' in outcome) return `error ${String(outcome.error.code)} ${outcome.error.message ?? ''}`.trim();
  const json = JSON.stringify(outcome.result) ?? 'undefined';
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
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

/** Wait for a click on one of the buttons, and say which. */
function clicked<T extends string>(ids: T[]): Promise<T> {
  return new Promise((resolve) => {
    const handlers = ids.map((id) => {
      const handler = () => {
        ids.forEach((other, index) => element(other).removeEventListener('click', handlers[index]));
        resolve(id);
      };
      element(id).addEventListener('click', handler);
      return handler;
    });
  });
}

/** Send the step's request, and wait for its outcome, or for the user to skip it. */
async function send(provider: Provider, step: Step, context: Context): Promise<Outcome | undefined> {
  const request = step.request!(context);
  const started = Date.now();
  setState('running', step);
  const asking = setTimeout(() => {
    setState('waiting', step);
    element<HTMLButtonElement>('skip').disabled = false;
  }, ASKING_AFTER);
  const settled = provider.request(request).then(
    (result) => ({ result }),
    (error: { code?: unknown; message?: string }) => ({ error: { code: error?.code, message: error?.message } }),
  );
  const skipped = clicked(['skip']).then(() => undefined);
  const outcome = await Promise.race([settled.then((value) => ({ ...value, asked: Date.now() - started >= ASKING_AFTER }) as Outcome), skipped]);
  clearTimeout(asking);
  element<HTMLButtonElement>('skip').disabled = true;
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
        listStep(step.title, 'skipped', 'skipped');
        break;
      }
      step.learn?.(context, outcome);
      const verdict = classify(step.expect, outcome);
      listStep(step.title, describeOutcome(outcome), verdict);
      if (verdict !== 'not-as-asked') break;
      setState('not-as-asked', step);
      element('mismatch').textContent = `This step asked you to ${step.expect} in your wallet, and the wallet answered: ${describeOutcome(outcome)}. Both are recorded.`;
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
  const file = `${profile.wallet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'wallet'}-${profile.wallet.version}.json`;
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

async function main(): Promise<void> {
  if (!window.__dappressTrace) throw new Error('The recorder did not load: reload the page.');
  const config = (await (await fetch('/config.json')).json()) as { anvilUrl: string; dappressVersion: string };
  const reference = (await (await fetch('/reference-profile.json')).json()) as Profile;
  const wallets = await discover();
  const { wallet, version, otherWallets } = await choose(wallets);
  // Leaving the page loses the session
  const leaving = (event: BeforeUnloadEvent) => event.preventDefault();
  window.addEventListener('beforeunload', leaving);
  const marks = await runFlow(wallet.provider, { anvilUrl: config.anvilUrl });
  window.removeEventListener('beforeunload', leaving);
  const trace = plainTrace(window.__dappressTrace);
  const profile = buildProfile(chunksOf(trace, marks), {
    wallet: { name: wallet.info.name ?? 'Unknown wallet', version },
    recorded: { by: `dappress probe ${config.dappressVersion}`, date: new Date().toISOString(), browser: navigator.userAgent, ...(otherWallets ? { otherWallets } : {}) },
  });
  finish(profile, reference);
}

main().catch((error: Error) => {
  setState('failed');
  const failure = element('failure');
  failure.textContent = `The probe stopped: ${error.message}`;
  failure.hidden = false;
});
```

- [ ] **Step 4: Type-check and lint**

Run: `npm run check`
Expected: PASS. `tsc -p tsconfig.json` type-checks `main.ts` with the `dom` library.

- [ ] **Step 5: Commit**

```bash
git add src/probe/page/index.html src/probe/page/style.css src/probe/page/main.ts
git commit -m "Write the probe page: choose the wallet, run the flow, compare and download the profile"
```

---

### Task 10: Build the page into `dist/probe`, deterministically

**Files:**
- Create: `scripts/build-probe.ts`
- Modify: `package.json` (`build`, `devDependencies`), `tsconfig.build.json`, `.github/workflows/ci.yml`

- [ ] **Step 1: Pin esbuild**

Run: `npm install --save-dev --save-exact esbuild@0.28.2`
Expected: `package.json` has `"esbuild": "0.28.2"` in `devDependencies`; `dependencies` is unchanged (four entries).

- [ ] **Step 2: Write `scripts/build-probe.ts`**

```ts
// Builds the probe page into dist/probe, next to the compiled command and
// server: the page's script bundled for the browser, with the profile code it
// shares with Node, and its static files as they are, the recorder among them.
// Deterministic: the reproducible build compares dist with what npm serves.

import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist', 'probe');

async function main(): Promise<void> {
  fs.mkdirSync(out, { recursive: true });
  await build({
    entryPoints: [path.join(root, 'src', 'probe', 'page', 'main.ts')],
    outfile: path.join(out, 'probe.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    charset: 'utf8',
    legalComments: 'none',
    logLevel: 'warning',
  });
  for (const file of ['index.html', 'style.css']) fs.copyFileSync(path.join(root, 'src', 'probe', 'page', file), path.join(out, file));
  fs.copyFileSync(path.join(root, 'conformance', 'recorder.js'), path.join(out, 'recorder.js'));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 3: Leave the page out of `tsc`'s build, and add the bundle to the build script**

In `tsconfig.build.json`, set `exclude` to:

```json
  "exclude": ["src/**/*.test.ts", "src/probe/page/**"]
```

In `package.json`, set the `build` script to:

```json
"build": "rm -rf dist && tsc -p tsconfig.build.json && mkdir -p dist/profiles && cp reports/profiles/*.json dist/profiles/ && tsx scripts/build-probe.ts",
```

- [ ] **Step 4: Build twice and compare**

Run:

```bash
npm run build && cp -r dist /tmp/dappress-dist-1 && npm run build && diff -r /tmp/dappress-dist-1 dist && echo identical
ls dist/probe dist/cli.js
grep -rl "https://" dist | grep -v -e 'dist/download' -e 'dist/config' || echo "no other https URL"
```

Expected: `identical`; `dist/probe` lists `command.js`, `server.js`, `anvil.js`, `flow.js` (and their `.d.ts`), `index.html`, `probe.js`, `recorder.js`, `style.css`; `dist/cli.js` exists; `no other https URL`. If the `grep` lists a file, find the URL with `grep -n "https://" <file>` and rewrite it without its scheme in the source, then build again. (`src/download.ts` and `src/config.ts` hold MetaMask's release URL, which SECURITY.md names.)

- [ ] **Step 5: Run the command from the build, by hand, once**

Run: `node dist/cli.js` → prints the usage, exits 1.
Run: `node dist/cli.js probe` → prints the Anvil URL, the page's URL and the reminder. Open the page's URL in a browser: the page loads, says no wallet is found if none is installed. Ctrl+C: the command stops, and `curl -s http://127.0.0.1:8545` fails (Anvil is gone).

- [ ] **Step 6: Check the build in CI twice**

In `.github/workflows/ci.yml`, replace the last step `- run: npm run build` with:

```yaml
      # The build twice, compared: the reproducible build needs the same dist from the same tag
      - name: Build, twice, to the same dist
        run: |
          npm run build
          cp -r dist "$RUNNER_TEMP/dist"
          npm run build
          diff -r "$RUNNER_TEMP/dist" dist
```

- [ ] **Step 7: Run the checks, and commit**

Run: `npm run check`
Expected: PASS.

```bash
git add scripts/build-probe.ts package.json package-lock.json tsconfig.build.json .github/workflows/ci.yml
git commit -m "Bundle the probe page into dist/probe with esbuild, and check the build is the same twice"
```

---

### Task 11: Go through the page with Dappress, on MetaMask and on the mocks

**Files:**
- Create: `conformance/cypress.probe.config.ts`, `conformance/cypress/support/probe.ts`, `conformance/cypress/probe/probe.cy.ts`
- Modify: `scripts/conformance.ts` (`--probe`)

- [ ] **Step 1: Write the Cypress config of the run**

`conformance/cypress.probe.config.ts`:

```ts
import { defineConfig } from 'cypress';
// The package under test, from its sources
import { configureDappress } from '../src';
import { loadProfile } from '../src/wallet-profile';

// Goes through the probe page with Dappress's commands. `npm run conformance
// -- --probe` builds nothing: run `npm run build` first. It starts Anvil and
// the page, and sets DAPPRESS_PROBE_URL to the page and DAPPRESS_PROBE_REFERENCE
// to the profile the recorded one must agree with: MetaMask's, or the mock's.
export default defineConfig({
  e2e: {
    baseUrl: process.env.DAPPRESS_PROBE_URL,
    specPattern: 'cypress/probe/**/*.cy.ts',
    supportFile: 'cypress/support/probe.ts',
    // One wallet and one page for the whole flow
    testIsolation: false,
    video: false,
    setupNodeEvents(on, config) {
      config.expose = { ...config.expose, probeReference: loadProfile(process.env.DAPPRESS_PROBE_REFERENCE || 'metamask') };
      return configureDappress(on, config, { chains: { '0x7a69': 'http://127.0.0.1:8545' } });
    },
  },
});
```

`conformance/cypress/support/probe.ts`:

```ts
// The probe page loads its own recorder: Dappress's commands only
import '../../../src/support';
```

- [ ] **Step 2: Write the spec**

`conformance/cypress/probe/probe.cy.ts`:

```ts
import { outcomeSet, type Profile } from '../../../src/profile-build';

// The probe page, gone through as a user would, with Dappress's commands
// answering each prompt the page asks to accept or reject. The profile it
// builds must answer as the one the suite recorded for this wallet: every
// outcome the page saw is one the reference holds, method by method. A mock
// answers 4200 to what its profile never saw; the reference has no entry then.

const reference = Cypress.expose('probeReference') as Profile;

type Decision = 'connection' | 'signature' | 'transaction' | 'network' | 'switch' | 'token';
const commands: Record<Decision, { accept: () => void; reject: () => void }> = {
  connection: { accept: () => cy.connectToDapp(), reject: () => cy.rejectConnection() },
  signature: { accept: () => cy.confirmSignature(), reject: () => cy.rejectSignature() },
  transaction: { accept: () => cy.confirmTransaction(), reject: () => cy.rejectTransaction() },
  network: { accept: () => cy.approveNewNetwork(), reject: () => cy.rejectNewNetwork() },
  switch: { accept: () => cy.approveSwitchNetwork(), reject: () => cy.rejectSwitchNetwork() },
  token: { accept: () => cy.approveAddToken(), reject: () => cy.rejectAddToken() },
};

// Answer the page's prompts until it has finished: at most one per step
function answerPrompts(left: number): void {
  cy.get('#probe', { timeout: 60000 })
    .should(($probe) => expect($probe.attr('data-state')).to.be.oneOf(['waiting', 'finished', 'not-as-asked', 'failed']))
    .then(($probe) => {
      const state = $probe.attr('data-state');
      if (state === 'finished') return;
      if (state !== 'waiting') throw new Error(`The probe page is ${state}: ${Cypress.$('#mismatch, #failure').text()}`);
      if (left === 0) throw new Error('The probe page asked for more decisions than it has steps');
      const decision = $probe.attr('data-decision') as Decision;
      const expected = $probe.attr('data-expect') as 'accept' | 'reject';
      commands[decision][expected]();
      answerPrompts(left - 1);
    });
}

describe('The probe page', () => {
  it('records a profile that answers as the reference, step by step', () => {
    cy.visit('/');
    cy.get('#wallets input[type=radio]').first().check();
    cy.get('#version').type(reference.wallet.version);
    cy.get('#start').click();
    answerPrompts(30);
    cy.get('#download').should('be.visible');
    cy.window()
      .its('dappressProbe.profile')
      .then((profile: Profile) => {
        expect(profile.wallet.version).to.eq(reference.wallet.version);
        const strays = Object.entries(profile.methods).flatMap(([method, observations]) => {
          const known = new Set(outcomeSet(reference.methods[method]));
          return outcomeSet(observations)
            .filter((outcome) => !known.has(outcome))
            .filter((outcome) => !(outcome.startsWith('error 4200') && !reference.methods[method]))
            .map((outcome) => `${method}: ${outcome}`);
        });
        expect(strays, 'outcomes the reference never recorded').to.deep.equal([]);
      });
  });
});
```

- [ ] **Step 3: Add `--probe` to the conformance script**

In `scripts/conformance.ts`:
- Below `const open = args.includes('--open');` add `const probe = args.includes('--probe');`.
- Add the import `import { startProbeServer } from '../src/probe/server';`.
- In the header comment, after the paragraph on `--open`, add: `// --probe goes through the probe page (dist/probe: run npm run build first) with Dappress's commands, and checks the profile it records against MetaMask's, or the mock's. It writes no report.`
- In `main()`, replace `if (open) return openApp(anvil);` with:

```ts
  if (open) return openApp(anvil);
  if (probe) return runProbe(anvil);
```

- Add, after `openApp`:

```ts
/**
 * The probe page, gone through with Dappress's commands on the wallet of this
 * run: MetaMask, or the mock. Its profile must answer as the suite's own.
 */
async function runProbe(anvil: ChildProcess): Promise<void> {
  const root = path.join(__dirname, '..', 'dist', 'probe');
  const server = await startProbeServer({ root, anvilUrl: ANVIL_URL, reference: loadProfile('metamask'), dappressVersion }).catch((error: Error) => {
    anvil.kill();
    throw new Error(`${error.message}: run npm run build first`);
  });
  process.env.DAPPRESS_PROBE_URL = server.url;
  process.env.DAPPRESS_PROBE_REFERENCE = mockWallet ?? 'metamask';
  let results;
  try {
    results = await cypress.run({
      project: path.join(__dirname, '..', 'conformance'),
      configFile: 'cypress.probe.config.ts',
      browser: process.env.DAPPRESS_BROWSER || 'chrome-for-testing',
      headed: mode.headed,
      env: { DAPPRESS_METAMASK_VERSION: metamaskVersion },
    });
  } finally {
    await server.close();
    anvil.kill();
  }
  if ('status' in results) throw new Error(results.message);
  console.log(`[dappress] Probe page: ${results.totalPassed} passed, ${results.totalFailed} failed`);
  process.exit(results.totalFailed === 0 ? 0 : 1);
}
```

`mockWallet` is the variable the script already sets from `DAPPRESS_MOCK` in mock mode; check its name with `grep -n "mockWallet" scripts/conformance.ts | head -3` and use it as is.

- [ ] **Step 4: Type-check the spec**

`tsconfig.json` includes `conformance/*.ts` and `conformance/cypress/**/*.ts`: the new config and spec are covered. Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Run it on the mocks, then on MetaMask**

Run:

```bash
npm run build
for wallet in metamask rabby phantom; do
  env -u ELECTRON_RUN_AS_NODE DAPPRESS_MODE=mock DAPPRESS_MOCK=$wallet npm run conformance -- --probe || echo "FAILED on $wallet"
done
env -u ELECTRON_RUN_AS_NODE DAPPRESS_MODE=headless npm run conformance -- --probe || echo "FAILED on MetaMask"
```

Expected: `Probe page: 1 passed, 0 failed` four times, no `FAILED`. On a failure, the message names the page's state or the stray outcomes: fix the step in `src/probe/flow.ts` or the page, add a unit test for it in `src/probe/flow.test.ts`, and run again.

- [ ] **Step 6: Commit**

```bash
git add conformance/cypress.probe.config.ts conformance/cypress/support/probe.ts conformance/cypress/probe/probe.cy.ts scripts/conformance.ts
git commit -m "Go through the probe page with Dappress, on MetaMask and the mocks, and check its profile against theirs"
```

---

### Task 12: Run the probe page in CI

**Files:**
- Modify: `.github/workflows/conformance.yml`

- [ ] **Step 1: Add the job**

In `.github/workflows/conformance.yml`, after the `mock:` job and before `publish:`, add:

```yaml
  # The probe page, gone through with Dappress's commands: on MetaMask, and on
  # the mocks. The profile it records must answer as theirs, method by method.
  probe:
    needs: version
    if: needs.version.outputs.run == 'true'
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    strategy:
      fail-fast: false
      matrix:
        include:
          - mode: headless
            wallet: ''
          - mode: mock
            wallet: metamask
          - mode: mock
            wallet: rabby
          - mode: mock
            wallet: phantom
    name: probe (${{ matrix.wallet || 'MetaMask' }}${{ matrix.mode == 'mock' && ', mock' || '' }})
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24

      - name: Install Chrome for Testing
        id: chrome
        run: |
          path=$(scripts/install-chrome.sh stable)
          echo "path=$path" >> "$GITHUB_OUTPUT"

      - uses: foundry-rs/foundry-toolchain@v1

      - run: npm ci

      - run: npm run build

      - name: Go through the probe page
        run: npm run conformance -- ${{ needs.version.outputs.version }} --probe
        env:
          DAPPRESS_MODE: ${{ matrix.mode }}
          DAPPRESS_MOCK: ${{ matrix.wallet }}
          DAPPRESS_BROWSER: ${{ steps.chrome.outputs.path }}

      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: probe-screenshots-${{ matrix.mode }}-${{ matrix.wallet || 'metamask' }}
          path: |
            conformance/cypress/screenshots
            /tmp/dappress
          if-no-files-found: ignore
```

Check how the `suite` job passes the MetaMask version to `npm run conformance` (`grep -n "npm run conformance" .github/workflows/conformance.yml`) and pass it the same way; if the job sets `DAPPRESS_METAMASK_VERSION` in `env` rather than as an argument, do that instead. `CHROME_BROKEN` is set at the workflow's top level and read by `scripts/install-chrome.sh`: nothing to add.

- [ ] **Step 2: Check the YAML**

Run: `ruby -ryaml -e 'YAML.load_file(".github/workflows/conformance.yml"); puts "ok"'`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/conformance.yml
git commit -m "Run the probe page in CI, on MetaMask and the mocks"
```

---

### Task 13: Documentation

**Files:**
- Modify: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`

- [ ] **Step 1: README**

In the section `## Wallet profiles`, replace the sentence `A wallet that is not there yet takes twenty minutes and a browser console to record: see [CONTRIBUTING.md](CONTRIBUTING.md#wallet-profiles).` with:

```markdown
### Record a wallet

A wallet that is not there yet, or a newer version of one, takes a few minutes to record, in the browser where it is installed:

```sh
npx dappress probe
```

The command starts Anvil and a page on your machine, and prints the page's URL. Open it, pick the wallet, and follow it: the page sends the wallet the requests of the conformance suite one by one, and says each time whether to accept or reject. At the end it shows where the wallet differs from MetaMask, and downloads its profile, which a mock replays at once: `configureDappress(on, config, { mock: './rabby-0.95.0.json' })`.

Use a test wallet: the profile holds its addresses and the signatures made on the page. It needs [Anvil](https://getfoundry.sh), as the mocks do. To share the profile, see [CONTRIBUTING.md](CONTRIBUTING.md#wallet-profiles).
```

In `## Contents`, nothing changes: the new heading is under `Wallet profiles`.

- [ ] **Step 2: CONTRIBUTING**

Replace the subsection `### Recording a wallet` (from its heading through the paragraph that starts `Then run the diff above`) with:

```markdown
### Recording a wallet

1. Disable the other wallet extensions: two active wallets inject two providers, and the profile would mix what each answers. The page warns when it sees another one.
2. Use a wallet made for testing, never your own: the profile holds everything the dapp saw, your accounts' addresses and the signatures you made included, and it is published.
3. `npx dappress probe` (or `npm run build && node dist/cli.js probe` from a clone), open the page it prints, pick the wallet, enter its version, and follow the steps.
4. Download the profile, check it with `npm run profile -- diff reports/profiles/metamask-13.50.0-headless.json <file>`, and open a pull request adding it to `reports/profiles/`: the workflow publishes what that folder holds with the suite's own, and the next person with a dapp to check has it.

The page runs the requests of `conformance/cypress/e2e/actions.cy.ts`, in its order, from `src/probe/flow.ts`; a step added to the suite goes there too. The conformance workflow goes through the page with Dappress's commands, on MetaMask and on the mocks (`npm run conformance -- --probe`), and checks its profile against theirs.

The page's test token is `src/probe/TestToken.sol`, compiled once into `src/probe/page/token.ts`. After a change to the contract, compile it again with Foundry, from the repository's root:

    work=$(mktemp -d) && mkdir "$work/src" && cp src/probe/TestToken.sol "$work/src/" \
      && (cd "$work" && forge build --use 0.8.28 --optimize --no-metadata --root . >/dev/null) \
      && jq -r .bytecode.object "$work/out/TestToken.sol/TestToken.json"

and put the printed bytecode in `TOKEN_BYTECODE`.
```

- [ ] **Step 3: SECURITY**

In `## What the package does, and how to check it`, after the bullet that starts `- **With a mock wallet**`, add:

```markdown
- **`npx dappress probe`** starts two local servers for as long as it runs, both on `127.0.0.1` only: Anvil, on 8545 unless `--anvil-port` says otherwise, never over a node already listening there; and the page (`src/probe/server.ts`), on a free port. The page's server holds its few files in memory and answers `GET` and `HEAD` for them only: no path from a request reaches the disk, nothing is written, and a request whose `Host` is not `127.0.0.1` or `localhost` is refused, against DNS rebinding. Its Content Security Policy lets the page run its own script only and reach itself and Anvil only. The page asks for no secret, sends nothing anywhere, and builds the profile in the browser for the user to download. That profile holds the addresses and signatures of the wallet used: the page and the command say to use a test wallet.
```

In `## Reporting a vulnerability`, add to the list of what a vulnerability is:

```markdown
- let the probe page's servers answer another host than the machine, serve a file other than the page's, write anything, or let the page reach another host than itself and Anvil;
```

- [ ] **Step 4: CHANGELOG**

Under `## [Unreleased]`, in `### Added` (create the heading if the section has none), add:

```markdown
- `npx dappress probe` records the profile of any wallet installed in your browser, in a few minutes: it starts Anvil and a local page that sends the wallet the requests of the conformance suite one by one, says each time whether to accept or reject, shows where the wallet differs from MetaMask, and downloads the profile, for a mock to replay or for a pull request to `reports/profiles/`. The page's server answers the machine only, serves its own files only and writes nothing; the page asks for no secret and sends nothing anywhere. The conformance workflow goes through the page with Dappress's commands, on MetaMask and on the mocks.
```

- [ ] **Step 5: Check, and commit**

Run: `npm run check`
Expected: PASS (Prettier ignores Markdown in this repository).

```bash
git add README.md CONTRIBUTING.md SECURITY.md CHANGELOG.md
git commit -m "Document the probe page: how to record a wallet, what the command and the page do and refuse"
```

---

### Task 14: First real use, by hand (Benjamin)

Not automatable: it needs the wallet extensions of a real browser.

- [ ] **Step 1:** `npm run build && node dist/cli.js probe`, open the page in a Chrome where Rabby is installed and the other wallets are disabled, record Rabby with a test wallet, download `rabby-<version>.json`.
- [ ] **Step 2:** The same with Phantom.
- [ ] **Step 3:** For each, `npm run profile -- diff reports/profiles/rabby-0.94.11.json <new file>`: the differences are what changed in the wallet since October 6, or a step the console recording did not have.
- [ ] **Step 4:** If a wallet does not appear in the page, check whether it injects with an inline script, which the page's policy (`script-src 'self'`) blocks: report it, as the policy then needs a nonce rather than a looser rule.
- [ ] **Step 5:** Replace the two profiles in `reports/profiles/`, run `DAPPRESS_MODE=mock DAPPRESS_MOCK=rabby npm run conformance` and the same for Phantom, adjust `differences` in `actions.cy.ts` to what the new profiles say, and commit: `Record Rabby <version> and Phantom <version> with the probe page`.
