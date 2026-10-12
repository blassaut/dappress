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
  {
    title: 'Revoke the permissions',
    instruction: ALONE,
    expect: 'none',
    request: () => ({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] }),
  },
  { title: 'Read the permissions once revoked', instruction: ALONE, expect: 'none', request: () => ({ method: 'wallet_getPermissions' }) },
];

/**
 * What the page says of a request still pending after ASKING_AFTER: `waiting`
 * for the user's decision on a step that asks for one; `slow` on a step the
 * wallet answers alone, which has nothing to decide, only to skip if it hangs.
 * MetaMask takes longer than that to read its capabilities on every chain.
 */
export function pendingState(step: Step): 'waiting' | 'slow' {
  return asksTheUser(step) ? 'waiting' : 'slow';
}

/** Whether the step asks the user to decide in the wallet: the page then lets them send it when ready. */
export function asksTheUser(step: Step): boolean {
  return step.expect !== 'none';
}

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

// JSON.stringify throws on a BigInt, which a wallet may answer with: a hex quantity, as a node would send it
const hexBigInt = (_key: string, value: unknown) => (typeof value === 'bigint' ? `0x${value.toString(16)}` : value);

/** The trace as plain JSON, as a file holds it: a BigInt as a hex quantity. A cycle throws. */
export function plainTrace(trace: TraceChunk): TraceChunk {
  return JSON.parse(JSON.stringify(trace, hexBigInt)) as TraceChunk;
}

/** What an outcome says, for the list of steps: the error's code and message, or the result, cut short. */
export function describeOutcome(outcome: Outcome): string {
  if ('error' in outcome) return `error ${String(outcome.error.code)} ${outcome.error.message ?? ''}`.trim();
  const json = JSON.stringify(outcome.result, hexBigInt) ?? 'undefined';
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}
