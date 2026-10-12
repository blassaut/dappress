import type { WalletSetup } from '../../src';

// The public Hardhat / Anvil test wallet, moved onto the Hoodi testnet at
// connection so the suite never touches Ethereum mainnet.
// A wallet that takes no chain the dapp adds, Phantom, stays on its own: there is no network to move it onto.
const noCustomChains = /phantom/i.test(process.env.DAPPRESS_MOCK ?? '');

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
