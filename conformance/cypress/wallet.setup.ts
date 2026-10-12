import type { WalletSetup } from '../../src';

// The public Hardhat / Anvil test wallet, moved onto the Hoodi testnet at
// connection so the suite never touches Ethereum mainnet.
// The Phantom mock refuses to add a chain, so there is no network to move it onto: it stays where it starts.
// Must match `differences.addChainRefused` in e2e/actions.cy.ts
const noCustomChains = process.env.DAPPRESS_MOCK === 'phantom';

const wallet: WalletSetup = {
  network: noCustomChains
    ? undefined
    : {
        chainId: '0x88bb0',
        chainName: 'Hoodi',
        rpcUrls: ['https://ethereum-hoodi-rpc.publicnode.com'],
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        blockExplorerUrls: ['https://hoodi.etherscan.io'],
      },
};

export default wallet;
