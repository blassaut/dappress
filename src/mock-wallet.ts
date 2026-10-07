// The mock wallet: an EIP-1193 provider in the dapp's page that answers as a
// wallet profile says the real wallet did, and keeps nothing secret. The
// requests a user decides on wait for the cy.* command that decides them;
// what they answer, when accepted, comes from the RPC endpoint, whose
// unlocked accounts sign and send (Anvil). Rejections, identity flags,
// constant results and the errors of a method the wallet lacks come from
// the profile. A method or an option the profile does not cover fails,
// and says so: the mock never succeeds at something the wallet was not
// seen doing.
//
// Browser code: no Node, no Cypress. support.ts installs it on the page.

import type { ConnectOptions, CustomGas, GasEstimate, TransactionOptions, WalletState } from './types';
import type { Observation, Profile, ProviderError } from './wallet-profile';

export interface MockWalletOptions {
  profile: Profile;
  /**
   * The endpoint that holds the keys: its unlocked accounts are the wallet's,
   * and sign. Anvil. It is also the chain of a chain the mock has no RPC for.
   */
  rpcUrl: string;
  /**
   * The RPC endpoint of each chain, by chain id: reads go there, and signed
   * transactions are sent there. A chain the dapp adds brings its own, from
   * wallet_addEthereumChain; these come first.
   */
  chains?: Record<string, string>;
  /** How long a command waits for the dapp to send the request it decides on, in ms. */
  timeout: number;
  /** Told what the mock answers from the profile, for the test's log: the wallet's name, and what it answered. */
  log?: (line: string) => void;
}

type Kind = 'connection' | 'signature' | 'transaction' | 'network' | 'switch' | 'token';

interface Pending {
  kind: Kind;
  method: string;
  params: unknown[];
  settle(outcome: { result?: unknown; error?: unknown }): void;
}

interface Listener {
  (payload: unknown): void;
}

/** The provider the dapp sees, as the real one: request(), on(), the identity flags. */
export interface MockProvider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on(event: string, listener: Listener): MockProvider;
  removeListener(event: string, listener: Listener): MockProvider;
  [flag: string]: unknown;
}

/** What support.ts drives in place of the Node tasks. */
export interface MockWallet {
  provider: MockProvider;
  act(action: string, argument?: unknown): Promise<unknown>;
  emit(event: string, payload: unknown): void;
  /** The RPC endpoint of the chain the dapp is on, for the commands that act on the chain itself. */
  chainEndpoint(): Promise<string>;
}

/** An error as a wallet throws it to the dapp: a code, and data when there is some. */
export class ProviderRpcError extends Error {
  code: unknown;
  data: unknown;
  constructor({ code, message, data }: ProviderError) {
    super(message ?? 'Unknown error');
    this.code = code;
    this.data = data;
  }
}

// A user's rejection, by the code EIP-1193 gives it
const USER_REJECTED = 4001;
const UNSUPPORTED = 4200;
const ERC20_APPROVE = '0x095ea7b3';
const ERC20_DECIMALS = '0x313ce567';

// Which pending requests each command decides on
const DECIDES: Record<string, { kinds: Kind[]; accept: boolean }> = {
  connectToDapp: { kinds: ['connection'], accept: true },
  rejectConnection: { kinds: ['connection'], accept: false },
  confirmSignature: { kinds: ['signature'], accept: true },
  rejectSignature: { kinds: ['signature'], accept: false },
  confirmTransaction: { kinds: ['transaction'], accept: true },
  rejectTransaction: { kinds: ['transaction'], accept: false },
  approveNewNetwork: { kinds: ['network'], accept: true },
  rejectNewNetwork: { kinds: ['network'], accept: false },
  approveSwitchNetwork: { kinds: ['switch'], accept: true },
  rejectSwitchNetwork: { kinds: ['switch'], accept: false },
  approveNetworkChange: { kinds: ['network', 'switch'], accept: true },
  approveAddToken: { kinds: ['token'], accept: true },
  rejectAddToken: { kinds: ['token'], accept: false },
};

const SIGNING = ['personal_sign', 'eth_sign', 'eth_signTypedData', 'eth_signTypedData_v3', 'eth_signTypedData_v4'];

/** Create the mock wallet of `profile`. `createMockWallet(options).provider` is what to give the page as window.ethereum. */
export function createMockWallet({ profile, rpcUrl, chains = {}, timeout, log }: MockWalletOptions): MockWallet {
  const wallet = `${profile.wallet.name} ${profile.wallet.version}`;
  // An answer taken from the profile is worth a line in the test's log: it is what the wallet does
  let lastRecorded: string | undefined;
  // The decisions the wallet took itself, from its profile, since the last command: a command
  // waiting for one of them has nothing to wait for
  const answeredWithoutAsking: { kind: Kind; line: string }[] = [];
  const recorded = <T extends ProviderRpcError | unknown>(method: string, answer: T): T => {
    const said = answer instanceof ProviderRpcError ? `${String(answer.code)} "${answer.message}"` : JSON.stringify(answer);
    lastRecorded = `${wallet} answers ${said} to ${method}, as recorded`;
    log?.(lastRecorded);
    return answer;
  };
  const listeners = new Map<string, Set<Listener>>();
  const pending: Pending[] = [];
  // The wallet's accounts, the RPC endpoint's: fetched once, named as MetaMask names them
  let accounts: Promise<string[]> | undefined;
  let selected = 0;
  // The accounts the dapp is connected with
  let connected: string[] = [];
  // The chain the wallet is on, and the ones the dapp added or was allowed onto
  let chainId = '0x1';
  const known = new Set<string>([chainId]);
  const permitted = new Set<string>([chainId]);
  // The chains the wallet knows of itself: those it asked the user to switch to, as the profile saw them rejected.
  // A switch it answered without asking says nothing: the wallet may have been on that chain already
  for (const observation of profile.methods.wallet_switchEthereumChain ?? []) {
    const chain = chainIn(observation.params);
    if (chain && observation.error?.code === USER_REJECTED) known.add(chain.toLowerCase());
  }
  let locked = false;
  let rpcId = 0;

  // The RPC endpoint of each chain: named in the options, or given by the dapp as it adds the chain
  const named = new Map<string, string>(Object.entries(chains).map(([chain, url]) => [chain.toLowerCase(), url]));
  const added = new Map<string, string>();
  const same = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');
  // The chain the keys' endpoint is on: a fork keeps the id of the chain it forks
  let keysChain: Promise<string | undefined> | undefined;
  const chainOfKeys = () =>
    (keysChain ??= call<string>(rpcUrl, 'eth_chainId').then(
      (chain) => chain.toLowerCase(),
      () => undefined,
    ));

  /**
   * Where the chain the dapp is on keeps its state: the RPC the options name;
   * else Anvil when it is on that chain, a fork of it; else the RPC the dapp
   * gave; else Anvil.
   */
  async function chainEndpoint(): Promise<string> {
    const chain = chainId;
    return named.get(chain) ?? ((await chainOfKeys()) === chain ? rpcUrl : (added.get(chain) ?? rpcUrl));
  }
  /** Whether the chain the dapp is on is another than the keys' own: transactions are then signed here and sent there. */
  const onAnotherChain = async () => !same(await chainEndpoint(), rpcUrl);

  /** A request to the chain the dapp is on: reads, and what a transaction needs to be filled in. */
  const rpc = async <T = unknown>(method: string, params: unknown[] = []) => call<T>(await chainEndpoint(), method, params);
  /** A request to the keys' endpoint: the accounts, and what they sign. */
  const keys = <T = unknown>(method: string, params: unknown[] = []) => call<T>(rpcUrl, method, params);

  async function call<T = unknown>(url: string, method: string, params: unknown[] = []): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
    const body = (await response.json()) as { result?: T; error?: ProviderError };
    if (body.error) throw new ProviderRpcError(body.error);
    return body.result as T;
  }

  const allAccounts = () => (accounts ??= keys<string[]>('eth_accounts').then((list) => list.map((address) => address.toLowerCase())));
  const nameOf = (index: number) => `Account ${index + 1}`;

  // The wallet outlives the pages: a listener of a page gone by is left to fail quietly
  function emit(event: string, payload: unknown): void {
    for (const listener of listeners.get(event) ?? []) {
      try {
        listener(payload);
      } catch {
        /* a dead page */
      }
    }
  }

  // What the profile recorded of `method`
  const observations = (method: string): Observation[] => profile.methods[method] ?? [];

  /** The error the wallet gave when the user rejected `method`: its own, or the wallet's usual one. */
  function rejection(method: string): ProviderRpcError {
    const own = observations(method).find((observation) => observation.error?.code === USER_REJECTED)?.error;
    const usual = Object.values(profile.methods)
      .flat()
      .find((observation) => observation.error?.code === USER_REJECTED)?.error;
    return recorded(method, new ProviderRpcError(own ?? usual ?? { code: USER_REJECTED, message: 'User rejected the request.' }));
  }

  /** An error the wallet gave to `method` that is not a user's rejection: the method it lacks, the chain it has not. */
  function refusal(method: string, params: unknown[] = []): ProviderRpcError | undefined {
    const observation = observations(method).find((candidate) => candidate.error && candidate.error.code !== USER_REJECTED);
    if (!observation?.error) return undefined;
    return recorded(method, new ProviderRpcError(retarget(observation.error, observation.params, params)));
  }

  /** A refusal the wallet gives without asking, for a request a command would otherwise decide on. */
  function refuseWithoutAsking(kind: Kind, method: string, params: unknown[]): ProviderRpcError | undefined {
    const refused = refusal(method, params);
    if (refused && lastRecorded) answeredWithoutAsking.push({ kind, line: lastRecorded });
    return refused;
  }

  /** EIP-3326's answer to a switch to a chain the wallet does not know, where the profile recorded none of its own. */
  function unrecognized(chain: string): ProviderRpcError {
    const error = new ProviderRpcError({ code: 4902, message: `Unrecognized chain ID "${chain}". Try adding the chain using wallet_addEthereumChain first.` });
    lastRecorded = `${wallet} answers 4902 "${error.message}" to wallet_switchEthereumChain, as EIP-3326 says: the profile has no answer of its own`;
    log?.(lastRecorded);
    answeredWithoutAsking.push({ kind: 'switch', line: lastRecorded });
    return error;
  }

  /** A method the wallet refused whenever it was asked, other than by a user's rejection: refused without asking. */
  function alwaysRefused(kind: Kind, method: string, params: unknown[]): ProviderRpcError | undefined {
    const seen = observations(method);
    if (!seen.length || !seen.every((observation) => observation.error && observation.error.code !== USER_REJECTED)) return undefined;
    return refuseWithoutAsking(kind, method, params);
  }

  /** What the wallet answered to `method` when accepted, or `fallback` when the profile has no such answer. */
  function result(method: string, fallback?: unknown): unknown {
    const observation = observations(method).find((candidate) => !candidate.error);
    if (observation) return recorded(method, observation.result);
    if (fallback !== undefined) return fallback;
    throw unsupported(method);
  }

  const unsupported = (what: string) =>
    new ProviderRpcError({
      code: UNSUPPORTED,
      message: `[dappress] ${what} is not recorded in the ${wallet} profile: the mock cannot say what the wallet answers`,
    });

  // A request the user decides on: it waits for the command that decides it
  function ask(kind: Kind, method: string, params: unknown[]): Promise<{ result?: unknown; error?: unknown }> {
    return new Promise((settle) => pending.push({ kind, method, params, settle }));
  }

  async function answered(kind: Kind, method: string, params: unknown[]): Promise<unknown> {
    const { result, error } = await ask(kind, method, params);
    if (error) throw error;
    return result;
  }

  function switchTo(chain: string): void {
    if (chain === chainId) return;
    chainId = chain;
    emit('chainChanged', chain);
  }

  async function request({ method, params }: { method: string; params?: unknown }): Promise<unknown> {
    const list = Array.isArray(params) ? params : params === undefined ? [] : [params];
    switch (method) {
      case 'eth_accounts':
        return connected;
      case 'eth_chainId':
        return chainId;
      case 'net_version':
        return String(parseInt(chainId, 16));
      case 'eth_requestAccounts':
      case 'wallet_requestPermissions': {
        if (!connected.length) await answered('connection', method, list);
        return method === 'eth_requestAccounts' ? connected : result(method, [{ parentCapability: 'eth_accounts' }]);
      }
      case 'wallet_revokePermissions': {
        const refused = refusal(method);
        if (refused) throw refused;
        disconnect();
        return result(method, null);
      }
      case 'wallet_addEthereumChain': {
        const chain = chainOf(list[0]);
        if (!known.has(chain)) await answered('network', method, list);
        // The chain's own RPC, unless the options name one
        const [given] = ((list[0] as { rpcUrls?: unknown }).rpcUrls ?? []) as string[];
        if (typeof given === 'string') added.set(chain, given);
        known.add(chain);
        permitted.add(chain);
        switchTo(chain);
        return result(method, null);
      }
      case 'wallet_switchEthereumChain': {
        const chain = chainOf(list[0]);
        if (!permitted.has(chain)) {
          // A chain the wallet does not know: the refusal it was recorded giving, or EIP-3326's 4902, for the dapp to add it
          if (!known.has(chain)) throw refuseWithoutAsking('switch', method, list) ?? unrecognized(chain);
          await answered('switch', method, list);
          permitted.add(chain);
        }
        switchTo(chain);
        return result(method, null);
      }
      case 'wallet_watchAsset': {
        const refused = alwaysRefused('token', method, list);
        if (refused) throw refused;
        await answered('token', method, list);
        return result(method);
      }
      case 'eth_sendTransaction':
        return answered('transaction', method, list);
    }
    if (SIGNING.includes(method)) {
      // A wallet that never signed with the method refuses it, whatever it says
      const seen = observations(method);
      if (seen.length && seen.every((observation) => observation.error)) throw new ProviderRpcError(seen[0].error!);
      return answered('signature', method, list);
    }
    const refused = refusal(method);
    if (refused) throw refused;
    if (/^(eth|net|web3)_/.test(method)) return rpc(method, list);
    throw unsupported(method);
  }

  function chainOf(param: unknown): string {
    const chain = (param as { chainId?: unknown })?.chainId;
    if (typeof chain !== 'string') throw new ProviderRpcError({ code: -32602, message: 'Expected a chainId' });
    return chain.toLowerCase();
  }

  function disconnect(): void {
    if (!connected.length) return;
    connected = [];
    emit('accountsChanged', []);
  }

  async function connect(options?: ConnectOptions): Promise<void> {
    const all = await allAccounts();
    let chosen = [all[selected]];
    if (options?.accounts !== undefined) {
      if (!Array.isArray(options.accounts) || !options.accounts.length)
        throw new Error('[dappress] connectToDapp({ accounts }) needs the name of at least one account');
      const names = all.map((_, index) => nameOf(index));
      const unknownNames = options.accounts.filter((name) => !names.includes(name));
      if (unknownNames.length)
        throw new Error(`[dappress] The wallet has no account named ${unknownNames.map((name) => `"${name}"`).join(', ')}: it has ${names.join(', ')}`);
      chosen = all.filter((_, index) => options.accounts!.includes(nameOf(index)));
    }
    connected = chosen;
    emit('accountsChanged', chosen);
  }

  /** The transaction as the options of confirmTransaction() set it: the spending cap, the fee. */
  async function adjusted(transaction: Record<string, unknown>, options?: TransactionOptions): Promise<Record<string, unknown>> {
    if (!options) return transaction;
    const { spendingCap, gas, ...unknownOptions } = options;
    const [stray] = Object.keys(unknownOptions);
    if (stray) throw new Error(`[dappress] confirmTransaction takes spendingCap and gas, not "${stray}"`);
    let adjustedTransaction = { ...transaction };
    if (spendingCap !== undefined) adjustedTransaction = await withSpendingCap(adjustedTransaction, amount(spendingCap, 'spendingCap'));
    if (gas !== undefined) adjustedTransaction = await withGas(adjustedTransaction, gas);
    return adjustedTransaction;
  }

  // An ERC-20 approval carries the cap as its last word: it is rewritten in the token's decimals
  async function withSpendingCap(transaction: Record<string, unknown>, cap: string): Promise<Record<string, unknown>> {
    const data = String(transaction.data ?? '');
    if (!data.startsWith(ERC20_APPROVE) || data.length < 10 + 128)
      throw new Error('[dappress] spendingCap is for an ERC-20 approval, and this transaction is not one');
    const decimals = parseInt(await rpc<string>('eth_call', [{ to: transaction.to, data: ERC20_DECIMALS }, 'latest']), 16);
    const [whole, fraction = ''] = cap.split('.');
    if (fraction.length > decimals) throw new Error(`[dappress] spendingCap ${cap} has more decimals than the token (${decimals})`);
    const units = BigInt(whole + fraction.padEnd(decimals, '0'));
    // Another amount is another write: the gas the dapp estimated for its own may not do, as MetaMask estimates it again
    const rewritten: Record<string, unknown> = { ...transaction, data: data.slice(0, 10 + 64) + units.toString(16).padStart(64, '0') };
    delete rewritten.gas;
    return { ...rewritten, gas: await rpc<string>('eth_estimateGas', [rewritten]) };
  }

  // The fee as the fee editor would set it. The mock has no fee estimates: "networkSuggested" is the gas price, as on a local node
  async function withGas(transaction: Record<string, unknown>, gas: GasEstimate | CustomGas): Promise<Record<string, unknown>> {
    if (typeof gas === 'string') {
      if (gas !== 'networkSuggested')
        throw new Error(`[dappress] The mock offers no "${gas}" fee: it has no fee estimates. Use "networkSuggested" or custom values`);
      const gasPrice = await rpc<string>('eth_gasPrice');
      return { ...transaction, maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice };
    }
    const fields = Object.keys(gas || {}) as (keyof CustomGas)[];
    const [stray] = fields.filter((field) => !['maxBaseFee', 'priorityFee', 'gasLimit'].includes(field));
    if (stray || !fields.length) throw new Error(`[dappress] Custom gas takes maxBaseFee, priorityFee, gasLimit, not ${stray ? `"${stray}"` : 'nothing'}`);
    const set = { ...transaction };
    if (gas.maxBaseFee !== undefined) set.maxFeePerGas = gwei(amount(gas.maxBaseFee, 'gas.maxBaseFee'));
    if (gas.priorityFee !== undefined) set.maxPriorityFeePerGas = gwei(amount(gas.priorityFee, 'gas.priorityFee'));
    if (gas.gasLimit !== undefined) set.gas = `0x${BigInt(amount(gas.gasLimit, 'gas.gasLimit')).toString(16)}`;
    return set;
  }

  /** What a transaction needs to be signed for the chain the dapp is on: its chain id, the account's nonce there, gas and fees there. */
  async function filledIn(transaction: Record<string, unknown>): Promise<Record<string, unknown>> {
    const filled: Record<string, unknown> = { ...transaction, chainId, nonce: await rpc<string>('eth_getTransactionCount', [transaction.from, 'pending']) };
    if (filled.gas === undefined) filled.gas = await rpc<string>('eth_estimateGas', [transaction]);
    if (filled.gasPrice === undefined && filled.maxFeePerGas === undefined) {
      const latest = await rpc<{ baseFeePerGas?: string }>('eth_getBlockByNumber', ['latest', false]);
      if (latest.baseFeePerGas) {
        // EIP-1559, with room for the base fee to rise twice, as wallets do
        const priority = BigInt(await rpc<string>('eth_maxPriorityFeePerGas').catch(() => '0x3b9aca00'));
        filled.maxPriorityFeePerGas = `0x${priority.toString(16)}`;
        filled.maxFeePerGas = `0x${(2n * BigInt(latest.baseFeePerGas) + priority).toString(16)}`;
      } else {
        filled.gasPrice = await rpc<string>('eth_gasPrice');
      }
    }
    return filled;
  }

  /** Settle the first pending request of one of `kinds`, once the dapp has sent it. */
  async function decide(action: string, argument: unknown): Promise<void> {
    const { kinds, accept } = DECIDES[action];
    const deadline = Date.now() + timeout;
    let request: Pending | undefined;
    while (!(request = pending.find((candidate) => kinds.includes(candidate.kind)))) {
      // The wallet answered it without asking: nothing will come to decide on
      const taken = answeredWithoutAsking.find((answer) => kinds.includes(answer.kind));
      if (taken) {
        answeredWithoutAsking.length = 0;
        throw new Error(`[dappress] Nothing for ${action} to decide on: ${taken.line}, without asking`);
      }
      // A request the wallet answered from its profile never waits for a decision: the likeliest reason
      if (Date.now() > deadline)
        throw new Error(
          `[dappress] The dapp sent no ${kinds.join(' or ')} request within ${timeout}ms: nothing for ${action} to decide on${lastRecorded ? `. ${lastRecorded}` : ''}`,
        );
      await sleep(100);
    }
    pending.splice(pending.indexOf(request), 1);
    answeredWithoutAsking.length = 0;
    if (!accept) return request.settle({ error: rejection(request.method) });
    try {
      request.settle({ result: await accepted(request, argument) });
    } catch (error) {
      request.settle({ error });
      throw error;
    }
  }

  // What an accepted request yields, by its kind
  async function accepted({ kind, method, params }: Pending, argument: unknown): Promise<unknown> {
    switch (kind) {
      case 'connection':
        await connect(argument as ConnectOptions | undefined);
        return connected;
      case 'signature':
        // The keys sign, whatever the chain. They take the message and the account; a dapp may add more, as MetaMask's test dapp does
        return keys(method, params.slice(0, 2));
      case 'transaction': {
        const transaction = await adjusted(params[0] as Record<string, unknown>, argument as TransactionOptions | undefined);
        if (!(await onAnotherChain())) return keys('eth_sendTransaction', [transaction]);
        // Filled in from the chain, signed by the keys, sent to the chain: as a wallet does
        const raw = await keys<string>('eth_signTransaction', [await filledIn(transaction)]);
        return rpc('eth_sendRawTransaction', [raw]);
      }
      default:
        return null;
    }
  }

  // The wallet's own screens, without screens
  const own: Record<string, (argument: unknown) => Promise<unknown>> = {
    setupMetaMask: async (): Promise<WalletState> => 'unlocked',
    addAccount: async () => {
      const all = await allAccounts();
      if (selected + 1 >= all.length) throw new Error(`[dappress] The RPC endpoint has ${all.length} accounts, all in use: the mock cannot add one`);
      selected += 1;
      if (connected.length) {
        connected = [all[selected]];
        emit('accountsChanged', connected);
      }
      return nameOf(selected);
    },
    switchAccount: async (name) => {
      const all = await allAccounts();
      const index = all.findIndex((_, candidate) => nameOf(candidate) === name);
      if (index === -1) throw new Error(`[dappress] The wallet has no account named "${String(name)}"`);
      selected = index;
      if (connected.length) {
        connected = [all[selected]];
        emit('accountsChanged', connected);
      }
      return null;
    },
    // The mock has no key: the account is taken over at the RPC endpoint (anvil_impersonateAccount),
    // which then sends for it. It cannot sign for it, and says so when asked
    importAccount: async (address) => {
      const account = String(address).toLowerCase();
      await keys('anvil_impersonateAccount', [account]).catch((error: Error) => {
        throw new Error(`[dappress] The RPC endpoint cannot act for ${account}: ${error.message}. importAccount() on the mock needs Anvil`);
      });
      const all = await allAccounts();
      if (!all.includes(account)) all.push(account);
      selected = all.indexOf(account);
      if (connected.length) {
        connected = [account];
        emit('accountsChanged', connected);
      }
      return nameOf(selected);
    },
    lockWallet: async () => {
      locked = true;
      return null;
    },
    unlockWallet: async (): Promise<WalletState> => {
      const was: WalletState = locked ? 'locked' : 'unlocked';
      locked = false;
      return was;
    },
    disconnectFromDapp: async () => {
      disconnect();
      return null;
    },
  };

  const provider: MockProvider = {
    request,
    on(event, listener) {
      (listeners.get(event) ?? listeners.set(event, new Set()).get(event)!).add(listener);
      return provider;
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
      return provider;
    },
    ...profile.discovery?.flags,
  };

  return {
    provider,
    emit,
    chainEndpoint,
    // A command other than the lock, or the unlock that says how it found the wallet, unlocks a locked wallet
    // first, as on MetaMask, where it finds the unlock form
    act: (action, argument) => {
      if (action !== 'lockWallet' && action !== 'unlockWallet') locked = false;
      return own[action]
        ? own[action](argument)
        : DECIDES[action]
          ? decide(action, argument)
          : Promise.reject(new Error(`[dappress] Unknown action ${action}`));
    },
  };
}

/**
 * Put the mock wallet into a page, as a wallet does: window.ethereum, the
 * EIP-6963 announcement, and the `connect` event when the profile has it.
 */
export function installMockWallet(win: Window & { ethereum?: unknown }, mock: MockWallet, options: MockWalletOptions): void {
  win.ethereum = mock.provider;
  const announced = options.profile.discovery?.eip6963[0];
  const info = { uuid: crypto.randomUUID(), name: announced?.name ?? options.profile.wallet.name, icon: ICON, rdns: announced?.rdns ?? 'io.dappress.mock' };
  // The page's own CustomEvent: the one its listeners expect
  const PageEvent = (win as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const announce = () => win.dispatchEvent(new PageEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider: mock.provider }) }));
  win.addEventListener('eip6963:requestProvider', announce);
  announce();
  // The wallet announces the chain it is on once the page has had a chance to listen
  if (options.profile.events.connect)
    setTimeout(() => mock.provider.request({ method: 'eth_chainId' }).then((chainId) => mock.emit('connect', { chainId })), 0);
}

/**
 * A recorded error names the chain it was asked for, "Unrecognized chain ID
 * "0x53a"": the chain asked for now takes its place.
 */
export function retarget(error: ProviderError, recordedParams: unknown, params: unknown[]): ProviderError {
  const was = chainIn(recordedParams);
  const now = chainIn(params);
  if (!was || !now || was === now) return error;
  return JSON.parse(JSON.stringify(error).split(was).join(now)) as ProviderError;
}

function chainIn(params: unknown): string | undefined {
  const chain = (Array.isArray(params) ? (params[0] as { chainId?: unknown } | undefined) : undefined)?.chainId;
  return typeof chain === 'string' ? chain : undefined;
}

// An amount as a user types it, "5" or "2.5", from a number or a string
function amount(value: unknown, name: string): string {
  const text = String(value).trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`[dappress] ${name} is an amount such as 5 or '2.5', not ${JSON.stringify(value)}`);
  return text;
}

// GWEI, as typed in the fee editor, to WEI in hex
function gwei(text: string): string {
  const [whole, fraction = ''] = text.split('.');
  return `0x${BigInt(whole + fraction.padEnd(9, '0').slice(0, 9)).toString(16)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A 1x1 transparent PNG: EIP-6963 wants an icon
const ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
