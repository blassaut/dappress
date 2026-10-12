// What the probe page does on Anvil itself, not through the wallet: fund the
// connected account, and deploy the test token. Anvil mines each transaction
// as it comes, and its receipt follows the hash within a few milliseconds.

import { TOKEN_BYTECODE } from './token';
import type { AnvilClient } from '../flow';

// A hundred ether, in wei
const BALANCE = `0x${(100n * 10n ** 18n).toString(16)}`;

// Up to five seconds for the receipt, which Anvil has in a few milliseconds
const RECEIPT_ATTEMPTS = 100;
const RECEIPT_EVERY = 50;

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
  // Anvil answers eth_sendTransaction before its receipt is readable (seen on 1.8.3: null on the very next call), so the receipt is waited for, not assumed.
  async function receiptOf(hash: string): Promise<{ status: string; contractAddress: string | null } | null> {
    for (let attempt = 0; attempt < RECEIPT_ATTEMPTS; attempt++) {
      const receipt = await call<{ status: string; contractAddress: string | null } | null>('eth_getTransactionReceipt', [hash]);
      if (receipt) return receipt;
      await new Promise((resolve) => setTimeout(resolve, RECEIPT_EVERY));
    }
    return null;
  }
  return {
    fund: async (account) => {
      await call('anvil_setBalance', [account, BALANCE]);
    },
    deployToken: async (holder) => {
      const [deployer] = await call<string[]>('eth_accounts');
      const data = `${TOKEN_BYTECODE}${holder.replace(/^0x/, '').toLowerCase().padStart(64, '0')}`;
      const hash = await call<string>('eth_sendTransaction', [{ from: deployer, data }]);
      const receipt = await receiptOf(hash);
      if (!receipt || receipt.status !== '0x1' || !receipt.contractAddress) throw new Error('The test token was not deployed on Anvil');
      return receipt.contractAddress.toLowerCase();
    },
  };
}
