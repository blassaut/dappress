import { testDapp } from '../support/testDapp';
import { provider, walletOf } from '../support/provider';

// One test per Dappress command, against MetaMask's test dapp and a local
// Anvil node for the funded transaction. scripts/conformance.ts starts Anvil
// and makes the wallet: run the suite through it. On the mock of another
// wallet, the tests assert what that wallet does differently, as its profile
// recorded it: `differences` below.
// The wallet setup (cypress/wallet.setup.ts) moves the dapp onto the Hoodi
// testnet at connection, so nothing is signed on Ethereum mainnet. A failing
// test means the MetaMask build under test moved something the adapter relies on.

// The wallet of this run, made by scripts/conformance.ts: its first two
// accounts, funded on Anvil, and a separate account to import from its key
const { accounts, imported } = Cypress.expose('conformance') as {
  accounts: [string, string];
  imported: { address: string; privateKey: string };
};
const [account, secondAccount] = accounts;

// The wallet under test: MetaMask, or the one whose profile the mock replays
const wallet = (Cypress.expose('dappress') as { mock?: { profile: { wallet: { name: string } } } } | undefined)?.mock?.profile.wallet.name ?? 'MetaMask';

/**
 * What the other wallets do differently, as their profiles recorded it: the
 * code they refuse a switch to a chain the dapp was not allowed on with,
 * without asking; what wallet_watchAsset answers when accepted, or the code
 * it is refused with, without asking; whether wallet_revokePermissions exists.
 */
const differences: { switchRefused?: number; watchAssetAnswers?: unknown; watchAssetRefused?: number; noRevokePermissions?: boolean } =
  {
    Rabby: { switchRefused: -32603, watchAssetAnswers: undefined },
    Phantom: { switchRefused: 4901, watchAssetRefused: -32000, noRevokePermissions: true },
  }[wallet] ?? {};

// Take the dapp's permission back: wallet_revokePermissions, or the wallet's own screen where it has none
const revoke = () => (differences.noRevokePermissions ? cy.disconnectFromDapp() : provider.call('wallet_revokePermissions', [{ eth_accounts: {} }]));

// The dapp connects with the wallet's selected account: disconnect, then connect again
const reconnect = () => {
  revoke();
  testDapp.connect();
  cy.connectToDapp();
};
const USER_REJECTED = 4001;
const SIGNATURE = /^0x[0-9a-f]{130}$/;

// allowance(owner, spender) of an ERC-20 token, as the data of an eth_call
const word = (address: string) => address.toLowerCase().replace('0x', '').padStart(64, '0');
const allowance = (owner: string, spender: string) => `0xdd62ed3e${word(owner)}${word(spender)}`;
// approve(spender, amount), as the data of a transaction to the token
const approve = (spender: string, amount: bigint) => `0x095ea7b3${word(spender)}${amount.toString(16).padStart(64, '0')}`;

const gwei = (amount: number) => `0x${BigInt(amount * 1e9).toString(16)}`;
// The transaction the provider was just asked to send, as the node holds it once mined
const minedTransaction = () =>
  provider
    .result()
    .its('result')
    .then((hash) =>
      provider.waitFor('eth_getTransactionByHash', [hash], (transaction) => Boolean((transaction as { blockNumber?: string } | null)?.blockNumber)),
    );

const hoodi = '0x88bb0';
// Known to MetaMask but not granted to the dapp (test networks are off by default), so switching asks the user
const sepolia = '0xaa36a7';
const anvil = {
  chainId: '0x7a69',
  chainName: 'Anvil',
  rpcUrls: ['http://127.0.0.1:8545'],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};
const unreachable = { ...anvil, chainId: '0x539', chainName: 'Unreachable', rpcUrls: ['http://127.0.0.1:8546'] };

describe('MetaMask actions', () => {
  it('injects the provider into the dapp', () => {
    testDapp.open();
    cy.window().should('have.property', 'ethereum');
    cy.window().its('ethereum').its('isMetaMask').should('eq', true);
  });

  it('rejectConnection', () => {
    testDapp.connect();
    cy.rejectConnection();
    // The dapp is left as it was: no account, and its button still offers to connect
    provider.call('eth_accounts').should('deep.equal', []);
    testDapp.connectButton().should('have.text', 'Connect').and('be.enabled');
    testDapp.accounts().should('be.empty');
  });

  it('connectToDapp, onto the network from the wallet setup', () => {
    testDapp.connect();
    cy.connectToDapp();
    testDapp.accounts().should('contain.text', account);
    cy.getAccountAddress().should('eq', account);
    testDapp.chainId().should('have.text', hoodi);
  });

  it('confirmSignature (personal_sign)', () => {
    testDapp.personalSign();
    cy.confirmSignature();
    testDapp.personalSignResult().should('contain.text', '0x');
  });

  it('rejectSignature (personal_sign)', () => {
    testDapp.personalSign();
    cy.rejectSignature();
    // The test dapp writes the error of a personal_sign on the button itself
    testDapp.personalSignButton().should('contain.text', 'rejected');
  });

  it('rejectSignature (signTypedData_v4)', () => {
    testDapp.signTypedDataV4();
    cy.rejectSignature();
    testDapp.signTypedDataV4Result().should('contain.text', 'rejected');
  });

  it('confirmSignature (signTypedData_v4)', () => {
    testDapp.signTypedDataV4();
    cy.confirmSignature();
    testDapp.signTypedDataV4Result().invoke('text').should('match', SIGNATURE);
  });

  it('rejectTransaction', () => {
    // The test dapp doesn't catch the rejection, which would fail the test
    cy.on('uncaught:exception', (error) => !error.message.includes('User denied transaction signature'));
    testDapp.sendEth();
    cy.rejectTransaction();
  });

  it('rejectNewNetwork', () => {
    provider.request('wallet_addEthereumChain', [unreachable]);
    cy.rejectNewNetwork();
    provider.result().its('error.code').should('eq', USER_REJECTED);
    testDapp.chainId().should('have.text', hoodi);
  });

  it('approveNewNetwork', () => {
    provider.request('wallet_addEthereumChain', [anvil]);
    cy.approveNewNetwork();
    provider.result().should('have.property', 'result');
    testDapp.chainId().should('have.text', anvil.chainId);
  });

  it('rejectSwitchNetwork', () => {
    provider.request('wallet_switchEthereumChain', [{ chainId: sepolia }]);
    if (differences.switchRefused) {
      provider.result().its('error.code').should('eq', differences.switchRefused);
    } else {
      cy.rejectSwitchNetwork();
      provider.result().its('error.code').should('eq', USER_REJECTED);
    }
    testDapp.chainId().should('have.text', anvil.chainId);
  });

  it('approveSwitchNetwork', () => {
    provider.request('wallet_switchEthereumChain', [{ chainId: sepolia }]);
    // A wallet that refuses the switch without asking leaves the dapp where it was
    if (differences.switchRefused) {
      provider.result().its('error.code').should('eq', differences.switchRefused);
      testDapp.chainId().should('have.text', anvil.chainId);
      return;
    }
    cy.approveSwitchNetwork();
    provider.result().should('have.property', 'result');
    testDapp.chainId().should('have.text', sepolia);
  });

  it('useNetwork, back to a network the dapp is allowed on', () => {
    cy.useNetwork(anvil);
    testDapp.chainId().should('have.text', anvil.chainId);
  });

  it('confirmTransaction', () => {
    testDapp.sendEth();
    cy.confirmTransaction();
    // Anvil mines at once, so the account's nonce moves as soon as MetaMask publishes the transaction
    provider.waitFor('eth_getTransactionCount', [account, 'latest'], (nonce) => nonce === '0x1').should('eq', '0x1');
  });

  it('approveAddToken', () => {
    testDapp.createToken();
    cy.confirmTransaction();
    testDapp
      .tokenAddress()
      .should('match', /^0x[0-9a-fA-F]{40}$/)
      .then((address) => {
        provider.request('wallet_watchAsset', { type: 'ERC20', options: { address, symbol: 'TST', decimals: 4 } });
        if (differences.watchAssetRefused) {
          provider.result().its('error.code').should('eq', differences.watchAssetRefused);
          return;
        }
        cy.approveAddToken();
        provider.result().should('deep.equal', { result: 'watchAssetAnswers' in differences ? differences.watchAssetAnswers : true });
      });
  });

  it('rejectAddToken', () => {
    testDapp.tokenAddress().then((address) => {
      provider.request('wallet_watchAsset', { type: 'ERC20', options: { address, symbol: 'TST', decimals: 4 } });
      if (differences.watchAssetRefused) {
        provider.result().its('error.code').should('eq', differences.watchAssetRefused);
        return;
      }
      cy.rejectAddToken();
      provider.result().its('error.code').should('eq', USER_REJECTED);
    });
  });

  it('confirmTransaction (ERC-20 approval)', () => {
    testDapp.tokenAddress().then((token) => {
      testDapp.approveSpender().then((spender) => {
        const granted = [{ to: token, data: allowance(account, spender) }, 'latest'];
        // The token was just deployed: nothing is allowed yet
        provider.call('eth_call', granted).then((value) => expect(BigInt(value as string)).to.eq(0n));
        testDapp.approveTokens();
        cy.confirmTransaction();
        provider
          .waitFor('eth_call', granted, (value) => BigInt(value as string) > 0n)
          .then((value) => expect(BigInt(value as string) > 0n, 'allowance granted').to.eq(true));
      });
    });
  });

  it('confirmTransaction ({ spendingCap })', () => {
    testDapp.tokenAddress().then((token) => {
      testDapp.approveSpender().then((spender) => {
        const granted = [{ to: token, data: allowance(account, spender) }, 'latest'];
        testDapp.approveTokens();
        cy.confirmTransaction({ spendingCap: '2.5' });
        // The token has 4 decimals: the cap, not the amount the dapp asked for
        provider.waitFor('eth_call', granted, (value) => BigInt(value as string) === 25000n).then((value) => expect(BigInt(value as string)).to.eq(25000n));
      });
    });
  });

  it('confirmTransaction ({ gas })', () => {
    // No fee in the request: MetaMask makes it an EIP-1559 transaction, with its own estimate
    provider.request('eth_sendTransaction', [{ from: account, to: secondAccount, value: '0x1' }]);
    cy.confirmTransaction({ gas: { maxBaseFee: 30, priorityFee: 2.5, gasLimit: 50000 } });
    minedTransaction().should('include', { maxFeePerGas: gwei(30), maxPriorityFeePerGas: gwei(2.5), gas: '0xc350' });
  });

  it('confirmTransaction ({ spendingCap, gas })', () => {
    testDapp.tokenAddress().then((token) => {
      testDapp.approveSpender().then((spender) => {
        // The approval the test dapp asks for, sent from here to know its hash
        provider.request('eth_sendTransaction', [{ from: account, to: token, data: approve(spender, 70000n) }]);
        cy.confirmTransaction({ spendingCap: 5, gas: { gasLimit: 100000 } });
        // The gas limit holds, though MetaMask estimates it again when the cap is saved
        minedTransaction().should('include', { input: approve(spender, 50000n), gas: '0x186a0' });
      });
    });
  });

  it("confirmTransaction ({ gas: 'networkSuggested' })", () => {
    // Anvil gives MetaMask a gas price and no fee estimates: the one estimate it offers is that price, as both fees
    provider.call('eth_gasPrice').then((gasPrice) => {
      provider.request('eth_sendTransaction', [{ from: account, to: secondAccount, value: '0x1' }]);
      cy.confirmTransaction({ gas: 'networkSuggested' });
      // Not the fees of the test before, which MetaMask remembers for the account and would start from
      minedTransaction().should('include', { maxFeePerGas: gasPrice, maxPriorityFeePerGas: gasPrice });
    });
  });

  it('addAccount', () => {
    cy.addAccount().should('eq', 'Account 2');
    reconnect();
    cy.getAccountAddress().should('eq', secondAccount);
  });

  it('importAccount', () => {
    cy.importAccount(imported.privateKey).should('be.a', 'string');
    reconnect();
    cy.getAccountAddress().should('eq', imported.address);
  });

  it('switchAccount', () => {
    cy.switchAccount('Account 1');
    reconnect();
    cy.getAccountAddress().should('eq', account);
  });

  it('connectToDapp ({ accounts })', () => {
    const connected = () => provider.call('eth_accounts').then((addresses) => (addresses as string[]).map((address) => address.toLowerCase()).sort());
    const addresses = (...list: string[]) => list.map((address) => address.toLowerCase()).sort();
    // Two accounts where MetaMask suggests the selected one alone, and not the third the wallet has
    revoke();
    testDapp.connect();
    cy.connectToDapp({ accounts: ['Account 1', 'Account 2'] });
    connected().should('deep.equal', addresses(account, secondAccount));
    connected().should('not.include', imported.address.toLowerCase());
    // One that isn't the selected account: the suggested one is left out
    revoke();
    testDapp.connect();
    cy.connectToDapp({ accounts: ['Account 2'] });
    connected().should('deep.equal', addresses(secondAccount));
    // Leave the dapp connected with the selected account, as the tests before found it
    reconnect();
    cy.getAccountAddress().should('eq', account);
  });

  it('lockWallet', () => {
    cy.lockWallet();
    // MetaMask tells a connected dapp nothing of the lock: its request waits behind the unlock form
    provider.request('personal_sign', ['0x6c6f636b6564', account]);
  });

  it('unlockWallet', () => {
    cy.unlockWallet().should('eq', 'locked');
    // The request sent while it was locked
    cy.confirmSignature();
    provider
      .result()
      .its('result')
      .should('match', /^0x[0-9a-f]{130}$/);
    // Already unlocked: nothing to do
    cy.unlockWallet().should('eq', 'unlocked');
    cy.getAccountAddress().should('eq', account);
  });

  it('disconnectFromDapp', () => {
    cy.window().then((win) => walletOf(win).on('accountsChanged', cy.stub().as('accountsChanged')));
    cy.disconnectFromDapp();
    cy.get('@accountsChanged').should('have.been.calledWith', []);
    provider.call('eth_accounts').should('deep.equal', []);
    // Leave the dapp connected, as the tests before found it
    testDapp.connect();
    cy.connectToDapp();
    cy.getAccountAddress().should('eq', account);
  });
});
