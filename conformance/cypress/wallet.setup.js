// The public Hardhat / Anvil test wallet, moved onto the Hoodi testnet at
// connection so the suite never touches Ethereum mainnet.
module.exports = {
  password: 'Tester@1234',
  network: {
    chainId: '0x88bb0',
    chainName: 'Hoodi',
    rpcUrls: ['https://ethereum-hoodi-rpc.publicnode.com'],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorerUrls: ['https://hoodi.etherscan.io'],
  },
};
