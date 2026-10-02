import type { WalletSetup } from '../../types';

// The public Hardhat / Anvil test wallet, moved onto the Hoodi testnet at
// connection so the suite never touches Ethereum mainnet.
const wallet: WalletSetup = {
  network: {
    chainId: '0x88bb0',
    chainName: 'Hoodi',
    rpcUrls: ['https://ethereum-hoodi-rpc.publicnode.com'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://hoodi.etherscan.io'],
  },
};

export default wallet;
