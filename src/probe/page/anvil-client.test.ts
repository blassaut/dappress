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
    const body = answer
      ? { jsonrpc: '2.0', id, result: answer(params) }
      : { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
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

test('the receipt is waited for: Anvil may not have it yet when it returns the hash', async () => {
  let reads = 0;
  const { fetcher } = fakeAnvil({
    eth_accounts: () => [DEPLOYER],
    eth_sendTransaction: () => '0xhash',
    eth_getTransactionReceipt: () => (++reads < 3 ? null : { status: '0x1', contractAddress: TOKEN }),
  });
  assert.equal(await anvilClient('http://127.0.0.1:8545', fetcher).deployToken(ACCOUNT), TOKEN.toLowerCase());
  assert.equal(reads, 3);
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
