import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockWallet, networkRefused, ProviderRpcError } from './mock-wallet';
import type { Profile } from './wallet-profile';

const ACCOUNTS = ['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'];
const TOKEN = '0xa06d0bbaa95bcd9418ac3b1b596a51498a57ee61';
const SPENDER = '0x9bbfed6889322e016e0a02ee459d306fc19545d8';
const word = (value: string | bigint) => (typeof value === 'bigint' ? value.toString(16) : value.replace('0x', '')).padStart(64, '0');
const approve = (amount: bigint) => `0x095ea7b3${word(SPENDER)}${word(amount)}`;

const REJECTED = { code: 4001, message: 'User rejected the request.' };
const metamask: Profile = {
  schema: 'dappress-wallet-profile/0',
  wallet: { name: 'MetaMask', version: '13.50.0' },
  recorded: { by: 'test', date: '2026-10-06', recorder: '2' },
  discovery: { injected: 'before', flags: { isMetaMask: true, isRabby: false }, eip6963: [{ rdns: 'io.metamask', name: 'MetaMask' }] },
  methods: {
    eth_requestAccounts: [{ error: REJECTED }, { result: [ACCOUNTS[0]] }],
    eth_sendTransaction: [
      { error: { code: 4001, message: 'MetaMask Tx Signature: User denied transaction signature.', data: { location: 'confirmation' } } },
      { result: '0xhash' },
    ],
    wallet_addEthereumChain: [{ error: REJECTED }, { result: null }],
    wallet_switchEthereumChain: [
      { params: [{ chainId: '0xaa36a7' }], error: REJECTED },
      { params: [{ chainId: '0xaa36a7' }], result: null },
    ],
    wallet_watchAsset: [{ error: REJECTED }, { result: true }],
    wallet_revokePermissions: [{ result: null }],
  },
  events: { accountsChanged: [{ payload: [] }], chainChanged: [{ payload: '0x1' }], connect: [{ payload: { chainId: '0x1' } }] },
};
const rabby: Profile = {
  ...metamask,
  wallet: { name: 'Rabby', version: '0.94.11' },
  discovery: { injected: 'before', flags: { isMetaMask: true, isRabby: true }, eip6963: [{ rdns: 'io.rabby', name: 'Rabby Wallet' }] },
  methods: {
    ...metamask.methods,
    eth_sign: [{ error: REJECTED }],
    wallet_switchEthereumChain: [
      { error: { code: -32603, message: 'Unrecognized chain ID "0x1234". Try adding the chain using wallet_switchEthereumChain first.' } },
    ],
    wallet_watchAsset: [{ error: { code: -32602, message: "Invalid address 'Creation Failed'." }, params: {} }, { result: undefined }],
  },
};

/** A wallet over a fake RPC endpoint, which answers as Anvil would and keeps what was sent to it. */
function wallet(profile = metamask, timeout = 500, chains: Record<string, string> = {}) {
  const sent: { url: string; method: string; params: unknown[] }[] = [];
  const answers: Record<string, (params: unknown[]) => unknown> = {
    eth_accounts: () => ACCOUNTS,
    eth_call: ([call]) => ((call as { data: string }).data === '0x313ce567' ? '0x' + word(4n) : '0x'),
    eth_gasPrice: () => '0x3b9aca00',
    eth_estimateGas: () => '0xd0c3',
    eth_sendTransaction: () => '0xsent',
    personal_sign: () => '0xsignature',
    eth_blockNumber: () => '0x10',
    eth_chainId: () => '0x7a69',
    eth_getTransactionCount: () => '0x7',
    eth_getBlockByNumber: () => ({ number: '0x10', baseFeePerGas: '0x64' }),
    eth_maxPriorityFeePerGas: () => '0x2',
    eth_signTransaction: () => '0xraw',
    eth_sendRawTransaction: () => '0xlive',
  };
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    const { id, method, params } = JSON.parse(init.body) as { id: number; method: string; params: unknown[] };
    sent.push({ url, method, params });
    const answer = answers[method];
    const body = answer
      ? { jsonrpc: '2.0', id, result: answer(params) }
      : { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
    return new Response(JSON.stringify(body));
  }) as typeof fetch;
  const mock = createMockWallet({ profile, rpcUrl: 'http://anvil', chains, timeout });
  return { mock, provider: mock.provider, sent, lastSent: (method: string) => sent.filter((call) => call.method === method).at(-1) };
}

const settled = <T>(promise: Promise<T>): Promise<{ result?: T; error?: unknown }> =>
  promise.then(
    (result) => ({ result }),
    (error) => ({ error }),
  );

test('the provider carries the flags of the profile, and answers the chain and the accounts without asking', async () => {
  const { provider } = wallet(rabby);
  assert.equal(provider.isMetaMask, true);
  assert.equal(provider.isRabby, true);
  assert.equal(await provider.request({ method: 'eth_chainId' }), '0x1');
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), []);
});

test('a connection waits for the command, and a rejection is the one the wallet gave', async () => {
  const { mock, provider } = wallet();
  const events: unknown[] = [];
  provider.on('accountsChanged', (payload) => events.push(payload));
  const refused = settled(provider.request({ method: 'eth_requestAccounts' }));
  await mock.act('rejectConnection');
  const { error } = await refused;
  assert.ok(error instanceof ProviderRpcError);
  assert.equal(error.code, 4001);
  assert.equal(error.message, 'User rejected the request.');

  const connected = provider.request({ method: 'eth_requestAccounts' });
  await mock.act('connectToDapp');
  assert.deepEqual(await connected, [ACCOUNTS[0]]);
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), [ACCOUNTS[0]]);
  assert.deepEqual(events, [[ACCOUNTS[0]]]);
});

test('a transaction is sent by the RPC endpoint once confirmed, as the options set it', async () => {
  const { mock, provider, lastSent } = wallet();
  const transaction = { from: ACCOUNTS[0], to: TOKEN, data: approve(70000n) };
  const sent = provider.request({ method: 'eth_sendTransaction', params: [transaction] });
  await mock.act('confirmTransaction', { spendingCap: '2.5', gas: { maxBaseFee: 30, priorityFee: 2.5, gasLimit: 100000 } });
  assert.equal(await sent, '0xsent');
  assert.deepEqual(lastSent('eth_sendTransaction')?.params, [
    {
      from: ACCOUNTS[0],
      to: TOKEN,
      data: approve(25000n),
      maxFeePerGas: `0x${(30n * 10n ** 9n).toString(16)}`,
      maxPriorityFeePerGas: `0x${(25n * 10n ** 8n).toString(16)}`,
      gas: '0x186a0',
    },
  ]);
});

test('another spending cap is another write: the gas is estimated again, as MetaMask does', async () => {
  const { mock, provider, lastSent } = wallet();
  const sent = provider.request({ method: 'eth_sendTransaction', params: [{ from: ACCOUNTS[0], to: TOKEN, data: approve(70000n), gas: '0x695f' }] });
  await mock.act('confirmTransaction', { spendingCap: '2.5' });
  await sent;
  assert.deepEqual(lastSent('eth_sendTransaction')?.params, [{ from: ACCOUNTS[0], to: TOKEN, data: approve(25000n), gas: '0xd0c3' }]);
});

test('what the mock answers from the profile goes to the log', async () => {
  const lines: string[] = [];
  // The fake endpoint of wallet(), with a wallet of our own that logs
  const { sent } = wallet(rabby);
  const mock = createMockWallet({ profile: rabby, rpcUrl: 'http://anvil', timeout: 500, log: (line) => lines.push(line) });
  assert.deepEqual(sent, []);
  await assert.rejects(mock.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1234' }] }));
  const refused = settled(mock.provider.request({ method: 'eth_requestAccounts' }));
  await mock.act('rejectConnection');
  await refused;
  assert.deepEqual(lines, [
    'Rabby 0.94.11 answers -32603 "Unrecognized chain ID "0x1234". Try adding the chain using wallet_switchEthereumChain first." to wallet_switchEthereumChain, as recorded',
    'Rabby 0.94.11 answers 4001 "User rejected the request." to eth_requestAccounts, as recorded',
  ]);
});

test('a rejected transaction fails with the message the wallet gives, data included', async () => {
  const { mock, provider } = wallet();
  const refused = settled(provider.request({ method: 'eth_sendTransaction', params: [{ from: ACCOUNTS[0], to: ACCOUNTS[1], value: '0x1' }] }));
  await mock.act('rejectTransaction');
  const { error } = await refused;
  assert.equal((error as ProviderRpcError).message, 'MetaMask Tx Signature: User denied transaction signature.');
  assert.deepEqual((error as ProviderRpcError).data, { location: 'confirmation' });
});

test('an option the mock cannot honour fails, and says why', async () => {
  const { mock, provider } = wallet();
  const sent = settled(provider.request({ method: 'eth_sendTransaction', params: [{ from: ACCOUNTS[0], to: ACCOUNTS[1], value: '0x1' }] }));
  await assert.rejects(mock.act('confirmTransaction', { spendingCap: 5 }), /spendingCap is for an ERC-20 approval/);
  assert.match(String((await sent).error), /spendingCap is for an ERC-20 approval/);
  const again = settled(provider.request({ method: 'eth_sendTransaction', params: [{ from: ACCOUNTS[0], to: ACCOUNTS[1], value: '0x1' }] }));
  await assert.rejects(mock.act('confirmTransaction', { gas: 'low' }), /The mock offers no "low" fee/);
  await again;
});

test('a signature goes to the RPC endpoint with the two parameters it takes', async () => {
  const { mock, provider, lastSent } = wallet();
  const signed = provider.request({ method: 'personal_sign', params: ['0x68656c6c6f', ACCOUNTS[0], 'Example password'] });
  await mock.act('confirmSignature');
  assert.equal(await signed, '0xsignature');
  assert.deepEqual(lastSent('personal_sign')?.params, ['0x68656c6c6f', ACCOUNTS[0]]);
});

test('a method the wallet refused whenever it was asked is refused without asking', async () => {
  const { provider } = wallet(rabby);
  await assert.rejects(provider.request({ method: 'eth_sign', params: [ACCOUNTS[0], '0x01'] }), (error: ProviderRpcError) => error.code === 4001);
});

test('a switch to a chain the dapp is not allowed on: the error the wallet recorded, or the prompt', async () => {
  const { provider } = wallet(rabby);
  await assert.rejects(
    provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }),
    (error: ProviderRpcError) => error.code === -32603,
  );

  const prompting = wallet(metamask);
  const chains: unknown[] = [];
  prompting.provider.on('chainChanged', (payload) => chains.push(payload));
  const switching = prompting.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] });
  await prompting.mock.act('approveSwitchNetwork');
  assert.equal(await switching, null);
  assert.deepEqual(chains, ['0xaa36a7']);
  // Allowed now: no prompt
  assert.equal(await prompting.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] }), null);
  assert.equal(await prompting.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }), null);
});

test("a switch to a chain the wallet does not know: EIP-3326's 4902 where the profile has no answer, then the dapp adds it", async () => {
  const lines: string[] = [];
  wallet();
  const mock = createMockWallet({ profile: metamask, rpcUrl: 'http://anvil', timeout: 5000, log: (line) => lines.push(line) });
  await assert.rejects(
    mock.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1f915' }] }),
    (error: ProviderRpcError) =>
      error.code === 4902 && error.message === 'Unrecognized chain ID "0x1f915". Try adding the chain using wallet_addEthereumChain first.',
  );
  assert.match(lines.at(-1)!, /as EIP-3326 says/);
  // A command waiting for the switch fails at once
  await assert.rejects(mock.act('approveSwitchNetwork'), /Nothing for approveSwitchNetwork to decide on/);
  const adding = mock.provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x1f915', rpcUrls: ['http://chain'] }] });
  await mock.act('approveNewNetwork');
  assert.equal(await adding, null);
  assert.equal(await mock.provider.request({ method: 'eth_chainId' }), '0x1f915');
});

test('adding a chain prompts once, then switches without asking', async () => {
  const { mock, provider } = wallet();
  const hoodi = { chainId: '0x88bb0', chainName: 'Hoodi', rpcUrls: ['https://hoodi'] };
  const adding = provider.request({ method: 'wallet_addEthereumChain', params: [hoodi] });
  await mock.act('approveNetworkChange');
  assert.equal(await adding, null);
  assert.equal(await provider.request({ method: 'eth_chainId' }), '0x88bb0');
  assert.equal(await provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x1' }] }), null);
  assert.equal(await provider.request({ method: 'eth_chainId' }), '0x1');
});

test('a constant the wallet answered is answered as recorded, and one it never did is not invented', async () => {
  const { mock, provider } = wallet(rabby);
  const watching = provider.request({ method: 'wallet_watchAsset', params: { type: 'ERC20', options: { address: TOKEN } } });
  await mock.act('approveAddToken');
  assert.equal(await watching, undefined);
  await assert.rejects(
    provider.request({ method: 'wallet_getPermissions' }),
    (error: ProviderRpcError) => error.code === 4200 && /not recorded in the Rabby 0.94.11 profile/.test(error.message),
  );
  // A read goes to the RPC endpoint
  assert.equal(await provider.request({ method: 'eth_blockNumber' }), '0x10');
});

// What MetaMask 13.50.0 answered the conformance suite, its accounts, chains, origin, ids and dates those of that run
const RECORDED_PERMISSIONS = [
  {
    id: 'recorded',
    parentCapability: 'eth_accounts',
    invoker: 'https://metamask.github.io',
    caveats: [{ type: 'restrictReturnedAccounts', value: ['0x7b6bae7788079d5fd02dfcbb20f2adb5eb43174a'] }],
    date: 1,
  },
  {
    id: 'recorded',
    parentCapability: 'endowment:permitted-chains',
    invoker: 'https://metamask.github.io',
    caveats: [{ type: 'restrictNetworkSwitching', value: ['0x1', '0x88bb0'] }],
    date: 1,
  },
];
const UNAUTHORIZED = { code: 4100, message: 'The requested account and/or method has not been authorized by the user.' };
const withPermissions: Profile = {
  ...metamask,
  methods: {
    ...metamask.methods,
    wallet_getPermissions: [{ result: RECORDED_PERMISSIONS }, { result: [] }],
    wallet_requestPermissions: [
      { params: [{ eth_accounts: {} }], error: REJECTED },
      { params: [{ eth_accounts: {} }], result: RECORDED_PERMISSIONS },
    ],
    wallet_getCapabilities: [
      {
        params: ['0x7b6bae7788079d5fd02dfcbb20f2adb5eb43174a'],
        result: { '0x1': { atomic: { status: 'ready' } }, '0x88bb0': { atomic: { status: 'ready' } } },
      },
      { params: ['0x1738166e1e4a4500dfb74b8e34d7be026c7c4289'], error: UNAUTHORIZED },
    ],
  },
};

const connectedWallet = async (profile: Profile) => {
  const made = wallet(profile);
  made.mock.inPage({ location: { origin: 'https://dapp.example' } });
  const connecting = made.provider.request({ method: 'eth_requestAccounts' });
  await made.mock.act('connectToDapp');
  await connecting;
  return made;
};

type Permission = { id: string; parentCapability: string; invoker: string; date: number; caveats: { type: string; value: unknown }[] };

test("the permissions: as the wallet shapes them, with the mock's own accounts, chains, origin and grant; none while disconnected", async () => {
  const { provider } = wallet(withPermissions);
  assert.deepEqual(await provider.request({ method: 'wallet_getPermissions' }), []);
  const before = Date.now();
  const { mock: connected, provider: dapp } = await connectedWallet(withPermissions);
  const [accounts, chains] = (await dapp.request({ method: 'wallet_getPermissions' })) as Permission[];
  assert.deepEqual(accounts.caveats, [{ type: 'restrictReturnedAccounts', value: [ACCOUNTS[0]] }]);
  assert.deepEqual(chains.caveats, [{ type: 'restrictNetworkSwitching', value: ['0x1'] }]);
  for (const permission of [accounts, chains]) {
    assert.equal(permission.invoker, 'https://dapp.example');
    assert.notEqual(permission.id, 'recorded');
    assert.ok(permission.date >= before);
  }
  assert.equal(accounts.id, chains.id, 'one grant');
  await connected.act('disconnectFromDapp');
  assert.deepEqual(await dapp.request({ method: 'wallet_getPermissions' }), []);
  // A wallet whose profile never answered it: not invented
  await assert.rejects(wallet(metamask).provider.request({ method: 'wallet_getPermissions' }), (error: ProviderRpcError) => error.code === 4200);
});

test('wallet_requestPermissions asks the user while connected where the wallet was seen rejected for it, and each grant is a new one', async () => {
  const { mock, provider } = await connectedWallet(withPermissions);
  const [first] = (await provider.request({ method: 'wallet_getPermissions' })) as Permission[];
  const refused = settled(provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] }));
  await mock.act('rejectConnection');
  assert.equal(((await refused).error as ProviderRpcError).code, 4001);
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), [ACCOUNTS[0]], 'still connected');

  const granting = provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  await mock.act('connectToDapp');
  const [granted] = (await granting) as Permission[];
  assert.equal(granted.parentCapability, 'eth_accounts');
  assert.notEqual(granted.id, first.id);
});

// As Rabby and Phantom were recorded: granted at the step that asked the user to reject it, each grant with a new date
const grantsWithoutAsking: Profile = {
  ...rabby,
  methods: {
    ...rabby.methods,
    wallet_requestPermissions: [
      { params: [{ eth_accounts: {} }], result: [{ parentCapability: 'eth_accounts', date: 1 }] },
      { params: [{ eth_accounts: {} }], result: [{ parentCapability: 'eth_accounts', date: 2 }] },
    ],
  },
};

test('wallet_requestPermissions while connected is granted without asking where the wallet was seen granting it and never rejected for it; before, it is a connection', async () => {
  const { mock: fresh, provider: freshDapp } = wallet(grantsWithoutAsking);
  const connecting = freshDapp.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  await fresh.act('connectToDapp');
  const [connection] = (await connecting) as Permission[];
  assert.equal(connection.parentCapability, 'eth_accounts');

  const { mock, provider } = await connectedWallet(grantsWithoutAsking);
  const before = Date.now();
  const [first] = (await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })) as Permission[];
  assert.equal(first.parentCapability, 'eth_accounts');
  assert.ok(first.date >= before, 'a new date');
  // A command waiting to decide on it is told at once
  const started = Date.now();
  await assert.rejects(
    mock.act('rejectConnection'),
    /Nothing for rejectConnection to decide on: Rabby 0\.94\.11 answers \[\{"parentCapability":"eth_accounts","date":\d+\}\] to wallet_requestPermissions, as recorded, without asking/,
  );
  assert.ok(Date.now() - started < 1000);
  // Each grant is a new one
  await new Promise((resolve) => setTimeout(resolve, 5));
  const [second] = (await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })) as Permission[];
  assert.ok(second.date > first.date, 'another date');
});

test('wallet_requestPermissions while connected asks where the profile never saw it answered: the user decides', async () => {
  const { mock, provider } = await connectedWallet(metamask);
  const asking = provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  await mock.act('connectToDapp');
  assert.deepEqual(await asking, [{ parentCapability: 'eth_accounts' }]);
});

test('a grant without asking does not outlive the connection: the next connection waits for its command', async () => {
  const { mock, provider } = await connectedWallet(grantsWithoutAsking);
  await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  await provider.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
  // The command first, as cy.connectToDapp() waits for the dapp's request
  const deciding = mock.act('connectToDapp');
  const connecting = provider.request({ method: 'eth_requestAccounts' });
  await deciding;
  assert.deepEqual(await connecting, [ACCOUNTS[0]]);
});

test('wallet_getCapabilities: what the wallet named, for the chains asked; refused for an account not connected; not invented', async () => {
  const { provider: disconnected } = wallet(withPermissions);
  await assert.rejects(disconnected.request({ method: 'wallet_getCapabilities', params: [ACCOUNTS[0]] }), (error: ProviderRpcError) => error.code === 4100);
  const { provider } = await connectedWallet(withPermissions);
  assert.deepEqual(await provider.request({ method: 'wallet_getCapabilities', params: [ACCOUNTS[0]] }), {
    '0x1': { atomic: { status: 'ready' } },
    '0x88bb0': { atomic: { status: 'ready' } },
  });
  assert.deepEqual(await provider.request({ method: 'wallet_getCapabilities', params: [ACCOUNTS[0], ['0x88BB0', '0x7a69']] }), {
    '0x88bb0': { atomic: { status: 'ready' } },
  });
  await assert.rejects(
    provider.request({ method: 'wallet_getCapabilities', params: [ACCOUNTS[1]] }),
    (error: ProviderRpcError) => error.code === 4100 && error.message === UNAUTHORIZED.message,
  );
  const { provider: unrecorded } = await connectedWallet(metamask);
  await assert.rejects(unrecorded.request({ method: 'wallet_getCapabilities', params: [ACCOUNTS[0]] }), (error: ProviderRpcError) => error.code === 4200);
});

const withBatches: Profile = {
  ...withPermissions,
  methods: {
    ...withPermissions.methods,
    wallet_sendCalls: [
      {
        params: [{ version: '2.0.0', chainId: '0x7a69', from: '0x7b6bae7788079d5fd02dfcbb20f2adb5eb43174a', atomicRequired: false, calls: [] }],
        error: { code: 5710, message: 'EIP-7702 not supported on chain: 0x7a69' },
      },
    ],
  },
};
const batch = (chainId: string) => ({
  method: 'wallet_sendCalls',
  params: [{ version: '2.0.0', chainId, from: ACCOUNTS[0], atomicRequired: false, calls: [{ to: ACCOUNTS[1], value: '0x1' }] }],
});

test('wallet_sendCalls: refused without asking where the wallet named no atomic capability; not invented where it did', async () => {
  const { mock, provider, sent } = await connectedWallet(withBatches);
  await assert.rejects(
    provider.request(batch('0x539')),
    (error: ProviderRpcError) => error.code === 5710 && error.message === 'EIP-7702 not supported on chain: 0x539',
  );
  // A command waiting for the batch is told at once that the wallet answered it
  await assert.rejects(mock.act('confirmTransaction'), /Nothing for confirmTransaction to decide on: .*5710.*without asking/);
  // On a chain the wallet batches on, no batch was recorded
  await assert.rejects(provider.request(batch('0x88bb0')), (error: ProviderRpcError) => error.code === 4200);
  assert.equal(sent.filter((call) => /send|sign/i.test(call.method)).length, 0, 'nothing signed or sent');
  // A wallet whose profile never answered it
  const { provider: unrecorded } = await connectedWallet(withPermissions);
  await assert.rejects(unrecorded.request(batch('0x539')), (error: ProviderRpcError) => error.code === 4200);
});

test('the accounts: added, switched, disconnected, as the wallet names them', async () => {
  const { mock, provider } = wallet();
  const events: unknown[] = [];
  provider.on('accountsChanged', (payload) => events.push(payload));
  const connecting = provider.request({ method: 'eth_requestAccounts' });
  await mock.act('connectToDapp');
  await connecting;
  assert.equal(await mock.act('addAccount'), 'Account 2');
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), [ACCOUNTS[1]]);
  await mock.act('switchAccount', 'Account 1');
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), [ACCOUNTS[0]]);
  await mock.act('disconnectFromDapp');
  assert.deepEqual(await provider.request({ method: 'eth_accounts' }), []);
  assert.deepEqual(events, [[ACCOUNTS[0]], [ACCOUNTS[1]], [ACCOUNTS[0]], []]);
  await assert.rejects(mock.act('switchAccount', 'Account 9'), /no account named "Account 9"/);
});

test("a recorded refusal names the chain asked for now, not the recording's", async () => {
  const { provider } = wallet({
    ...rabby,
    methods: {
      ...rabby.methods,
      wallet_switchEthereumChain: [{ params: [{ chainId: '0x53a' }], error: { code: -32603, message: 'Unrecognized chain ID "0x53a".' } }],
    },
  });
  await assert.rejects(
    provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }),
    (error: ProviderRpcError) => error.message === 'Unrecognized chain ID "0xaa36a7".',
  );
});

test('a command waiting for a request the wallet refused without asking fails at once, and says why', async () => {
  const { mock, provider } = wallet(rabby, 5000);
  await assert.rejects(provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1234' }] }));
  const started = Date.now();
  await assert.rejects(mock.act('approveSwitchNetwork'), /Nothing for approveSwitchNetwork to decide on: Rabby 0\.94\.11 answers -32603 .*, without asking/);
  assert.ok(Date.now() - started < 1000);
});

test('a method the wallet refused whenever it was asked, other than by the user, is refused without asking', async () => {
  const phantom: Profile = {
    ...metamask,
    wallet: { name: 'Phantom', version: '26.32.0' },
    methods: { ...metamask.methods, wallet_watchAsset: [{ error: { code: -32000, message: 'Missing or invalid parameters.' } }] },
  };
  const { provider } = wallet(phantom);
  await assert.rejects(provider.request({ method: 'wallet_watchAsset', params: { type: 'ERC20' } }), (error: ProviderRpcError) => error.code === -32000);
});

test('adding a chain the wallet refused whenever it was asked is refused without asking, as recorded', async () => {
  const phantom: Profile = {
    ...metamask,
    wallet: { name: 'Phantom', version: '26.32.0' },
    methods: {
      ...metamask.methods,
      wallet_addEthereumChain: [{ params: [{ chainId: '0x88bb0' }], error: { code: 4901, message: 'The Provider is not connected to the requested chain.' } }],
    },
  };
  const { mock, provider } = wallet(phantom, 5000);
  await assert.rejects(
    provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x7a69', rpcUrls: ['http://chain'] }] }),
    (error: ProviderRpcError) => error.code === 4901 && error.message === 'The Provider is not connected to the requested chain.',
  );
  assert.notEqual(await provider.request({ method: 'eth_chainId' }), '0x7a69');
  assert.deepEqual(mock.chainsKept(), ['0x1']);
  // A command waiting for the network request is told at once
  const started = Date.now();
  await assert.rejects(mock.act('approveNewNetwork'), /Nothing for approveNewNetwork to decide on: Phantom 26\.32\.0 answers 4901 .*, without asking/);
  assert.ok(Date.now() - started < 1000);
});

test('the message of a network the wallet refused names the wallet, the chain and its answer; a mock that takes no chain adds the chains it knows', () => {
  const error = { code: 4901, message: 'The Provider is not connected to the requested chain.' };
  const network = { chainId: '0x7a69', chainName: 'Anvil' };
  assert.equal(
    networkRefused('MetaMask', network, error),
    '[dappress] MetaMask refused the network Anvil (0x7a69): it answers 4901 "The Provider is not connected to the requested chain.".',
  );
  assert.equal(
    networkRefused('Phantom', network, error, ['0x1']),
    '[dappress] Phantom refused the network Anvil (0x7a69): it answers 4901 "The Provider is not connected to the requested chain.". This wallet takes no chain the dapp adds: it knows only 0x1. Run the dapp on a fork that keeps one of these chain ids.',
  );
  assert.match(networkRefused('MetaMask', { chainId: '0x1' }, { message: 'No' }), /refused the network 0x1: it answers "No"\.$/);
});

test("on a chain the dapp added, reads go to the chain's RPC, and a transaction is signed by the keys and sent there", async () => {
  const { mock, provider, sent } = wallet();
  const connecting = provider.request({ method: 'eth_requestAccounts' });
  await mock.act('connectToDapp');
  await connecting;
  const adding = provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x88BB0', chainName: 'Hoodi', rpcUrls: ['http://hoodi'] }] });
  await mock.act('approveNewNetwork');
  await adding;
  sent.length = 0;

  assert.equal(await provider.request({ method: 'eth_blockNumber' }), '0x10');
  assert.equal(sent.at(-1)?.url, 'http://hoodi');

  const sending = provider.request({ method: 'eth_sendTransaction', params: [{ from: ACCOUNTS[0], to: ACCOUNTS[1], value: '0x1' }] });
  await mock.act('confirmTransaction');
  assert.equal(await sending, '0xlive');
  const where = sent.map(({ url, method }) => `${method} ${url}`);
  assert.deepEqual(where, [
    // Anvil is asked once which chain it is on: a fork of the dapp's would come first
    'eth_chainId http://anvil',
    'eth_blockNumber http://hoodi',
    'eth_getTransactionCount http://hoodi',
    'eth_estimateGas http://hoodi',
    'eth_getBlockByNumber http://hoodi',
    'eth_maxPriorityFeePerGas http://hoodi',
    'eth_signTransaction http://anvil',
    'eth_sendRawTransaction http://hoodi',
  ]);
  // Signed for the chain, with the nonce there, and fees that leave room for the base fee to rise
  assert.deepEqual(sent.find(({ method }) => method === 'eth_signTransaction')?.params, [
    { from: ACCOUNTS[0], to: ACCOUNTS[1], value: '0x1', chainId: '0x88bb0', nonce: '0x7', gas: '0xd0c3', maxPriorityFeePerGas: '0x2', maxFeePerGas: '0xca' },
  ]);
});

test('Anvil on the chain the dapp adds, a fork of it, comes before the RPC the dapp gives', async () => {
  const { mock, provider, sent } = wallet();
  const adding = provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x7a69', rpcUrls: ['http://public'] }] });
  await mock.act('approveNewNetwork');
  await adding;
  sent.length = 0;
  await provider.request({ method: 'eth_blockNumber' });
  assert.deepEqual(
    sent.map(({ url, method }) => `${method} ${url}`),
    ['eth_chainId http://anvil', 'eth_blockNumber http://anvil'],
  );
  assert.equal(await mock.chainEndpoint(), 'http://anvil');
});

test('a chain named in the options keeps its RPC, whatever the dapp gives; signatures stay with the keys', async () => {
  const { mock, provider, sent } = wallet(metamask, 500, { '0x88bb0': 'http://fork' });
  const connecting = provider.request({ method: 'eth_requestAccounts' });
  await mock.act('connectToDapp');
  await connecting;
  const adding = provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x88bb0', rpcUrls: ['http://hoodi'] }] });
  await mock.act('approveNewNetwork');
  await adding;
  sent.length = 0;
  await provider.request({ method: 'eth_blockNumber' });
  const signing = provider.request({ method: 'personal_sign', params: ['0x68656c6c6f', ACCOUNTS[0]] });
  await mock.act('confirmSignature');
  await signing;
  assert.deepEqual(
    sent.map(({ url, method }) => `${method} ${url}`),
    ['eth_blockNumber http://fork', 'personal_sign http://anvil'],
  );
});

test("a chain whose RPC is the keys' own sends through the keys, unlocked: a fork, or Anvil itself", async () => {
  const { mock, provider, sent } = wallet(metamask, 500, { '0xa4b1': 'http://anvil/' });
  const switching = provider.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0xa4b1' }] });
  await mock.act('approveNewNetwork');
  await switching;
  const connecting = provider.request({ method: 'eth_requestAccounts' });
  await mock.act('connectToDapp');
  await connecting;
  sent.length = 0;
  const sending = provider.request({ method: 'eth_sendTransaction', params: [{ from: ACCOUNTS[0], to: ACCOUNTS[1], value: '0x1' }] });
  await mock.act('confirmTransaction');
  assert.equal(await sending, '0xsent');
  assert.deepEqual(
    sent.map(({ url, method }) => `${method} ${url}`),
    ['eth_sendTransaction http://anvil'],
  );
});

test('a command with nothing to decide on says so, within the timeout', async () => {
  const { mock } = wallet(metamask, 200);
  await assert.rejects(mock.act('confirmSignature'), /sent no signature request within 200ms/);
});
