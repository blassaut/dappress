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
