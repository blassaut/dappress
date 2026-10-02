/// <reference types="../../../types/support" />

import { testDapp } from '../support/testDapp';
import { provider } from '../support/provider';

// One test per Dappress command, against MetaMask's test dapp and a local
// Anvil node for the funded transaction. scripts/conformance.js starts Anvil
// and makes the wallet: run the suite through it.
// The wallet setup (cypress/wallet.setup.js) moves the dapp onto the Hoodi
// testnet at connection, so nothing is signed on Ethereum mainnet. A failing
// test means the MetaMask build under test moved something the adapter relies on.

// The wallet of this run, made by scripts/conformance.js: its first two
// accounts, funded on Anvil, and a separate account to import from its key
const { accounts, imported } = Cypress.expose('conformance') as {
  accounts: [string, string];
  imported: { address: string; privateKey: string };
};
const [account, secondAccount] = accounts;

// The dapp connects with the wallet's selected account: disconnect, then connect again
const reconnect = () => {
  provider.call('wallet_revokePermissions', [{ eth_accounts: {} }]);
  testDapp.connect();
  cy.connectToDapp();
};
const USER_REJECTED = 4001;

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

  it('rejectSignature (signTypedData_v4)', () => {
    testDapp.signTypedDataV4();
    cy.rejectSignature();
    testDapp.signTypedDataV4Result().should('contain.text', 'rejected');
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
    cy.rejectSwitchNetwork();
    provider.result().its('error.code').should('eq', USER_REJECTED);
    testDapp.chainId().should('have.text', anvil.chainId);
  });

  it('approveSwitchNetwork', () => {
    provider.request('wallet_switchEthereumChain', [{ chainId: sepolia }]);
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
    testDapp.tokenAddress().should('match', /^0x[0-9a-fA-F]{40}$/).then((address) => {
      provider.request('wallet_watchAsset', { type: 'ERC20', options: { address, symbol: 'TST', decimals: 4 } });
      cy.approveAddToken();
      provider.result().should('deep.equal', { result: true });
    });
  });

  it('rejectAddToken', () => {
    testDapp.tokenAddress().then((address) => {
      provider.request('wallet_watchAsset', { type: 'ERC20', options: { address, symbol: 'TST', decimals: 4 } });
      cy.rejectAddToken();
      provider.result().its('error.code').should('eq', USER_REJECTED);
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
});
