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
