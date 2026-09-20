/**
 * Network registry.
 *
 * Every EVM network here exposes the *same* account (same seed -> same address)
 * and is reached through public, CORS-enabled JSON-RPC endpoints. `rpc` is an
 * ordered fallback list: the first endpoint that answers is used for the
 * remainder of the session.
 */

export const EVM_NETWORKS = [
  {
    id: 'ethereum',
    chainId: 1,
    name: 'Ethereum',
    shortName: 'ETH',
    testnet: false,
    symbol: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    color: '#627eea',
    rpc: [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://eth.drpc.org',
    ],
    explorer: {
      tx: (hash) => `https://etherscan.io/tx/${hash}`,
      address: (addr) => `https://etherscan.io/address/${addr}`,
    },
    blockscout: 'https://eth.blockscout.com/api/v2',
  },
  {
    id: 'base',
    chainId: 8453,
    name: 'Base',
    shortName: 'BASE',
    testnet: false,
    symbol: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    color: '#0052ff',
    rpc: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.drpc.org'],
    explorer: {
      tx: (hash) => `https://basescan.org/tx/${hash}`,
      address: (addr) => `https://basescan.org/address/${addr}`,
    },
    blockscout: 'https://base.blockscout.com/api/v2',
  },
  {
    id: 'polygon',
    chainId: 137,
    name: 'Polygon',
    shortName: 'POL',
    testnet: false,
    symbol: 'POL',
    decimals: 18,
    coingeckoId: 'polygon-ecosystem-token',
    color: '#8247e5',
    rpc: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org', 'https://rpc.ankr.com/polygon'],
    explorer: {
      tx: (hash) => `https://polygonscan.com/tx/${hash}`,
      address: (addr) => `https://polygonscan.com/address/${addr}`,
    },
    blockscout: 'https://polygon.blockscout.com/api/v2',
  },
  {
    id: 'arbitrum',
    chainId: 42161,
    name: 'Arbitrum One',
    shortName: 'ARB',
    testnet: false,
    symbol: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    color: '#28a0f0',
    rpc: ['https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum-one.drpc.org', 'https://rpc.ankr.com/arbitrum'],
    explorer: {
      tx: (hash) => `https://arbiscan.io/tx/${hash}`,
      address: (addr) => `https://arbiscan.io/address/${addr}`,
    },
    blockscout: 'https://arbitrum.blockscout.com/api/v2',
  },
  {
    id: 'optimism',
    chainId: 10,
    name: 'OP Mainnet',
    shortName: 'OP',
    testnet: false,
    symbol: 'ETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    color: '#ff0420',
    rpc: ['https://optimism-rpc.publicnode.com', 'https://optimism.drpc.org', 'https://rpc.ankr.com/optimism'],
    explorer: {
      tx: (hash) => `https://optimistic.etherscan.io/tx/${hash}`,
      address: (addr) => `https://optimistic.etherscan.io/address/${addr}`,
    },
    blockscout: 'https://optimism.blockscout.com/api/v2',
  },
  {
    id: 'bsc',
    chainId: 56,
    name: 'BNB Smart Chain',
    shortName: 'BNB',
    testnet: false,
    symbol: 'BNB',
    decimals: 18,
    coingeckoId: 'binancecoin',
    color: '#f3ba2f',
    rpc: ['https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org', 'https://rpc.ankr.com/bsc'],
    explorer: {
      tx: (hash) => `https://bscscan.com/tx/${hash}`,
      address: (addr) => `https://bscscan.com/address/${addr}`,
    },
    blockscout: null,
  },
  {
    id: 'avalanche',
    chainId: 43114,
    name: 'Avalanche C-Chain',
    shortName: 'AVAX',
    testnet: false,
    symbol: 'AVAX',
    decimals: 18,
    coingeckoId: 'avalanche-2',
    color: '#e84142',
    rpc: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://avalanche.drpc.org', 'https://rpc.ankr.com/avalanche'],
    explorer: {
      tx: (hash) => `https://snowtrace.io/tx/${hash}`,
      address: (addr) => `https://snowtrace.io/address/${addr}`,
    },
    blockscout: null,
  },
  {
    id: 'sepolia',
    chainId: 11155111,
    name: 'Sepolia Testnet',
    shortName: 'SEPOLIA',
    testnet: true,
    symbol: 'SepoliaETH',
    decimals: 18,
    coingeckoId: 'ethereum',
    color: '#cf9fff',
    rpc: ['https://sepolia-rpc.publicnode.com', 'https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org'],
    explorer: {
      tx: (hash) => `https://sepolia.etherscan.io/tx/${hash}`,
      address: (addr) => `https://sepolia.etherscan.io/address/${addr}`,
    },
    blockscout: null,
  },
];

export const BITCOIN_NETWORKS = [
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    shortName: 'BTC',
    testnet: false,
    symbol: 'BTC',
    decimals: 8,
    coingeckoId: 'bitcoin',
    color: '#f7931a',
    apiBase: 'https://mempool.space/api',
    explorer: {
      tx: (hash) => `https://mempool.space/tx/${hash}`,
      address: (addr) => `https://mempool.space/address/${addr}`,
    },
  },
  {
    id: 'bitcoin-testnet',
    name: 'Bitcoin Testnet',
    shortName: 'TBTC',
    testnet: true,
    symbol: 'tBTC',
    decimals: 8,
    coingeckoId: 'bitcoin',
    color: '#c98b2e',
    apiBase: 'https://mempool.space/testnet/api',
    explorer: {
      tx: (hash) => `https://mempool.space/testnet/tx/${hash}`,
      address: (addr) => `https://mempool.space/testnet/address/${addr}`,
    },
  },
];

export const ALL_NETWORKS = [...EVM_NETWORKS, ...BITCOIN_NETWORKS];

export const getEvmNetwork = (id) => EVM_NETWORKS.find((n) => n.id === id) ?? EVM_NETWORKS[0];
export const getNetwork = (id) => ALL_NETWORKS.find((n) => n.id === id) ?? ALL_NETWORKS[0];
export const isEvm = (network) => Boolean(network && network.chainId);

export const DEFAULT_NETWORK = 'ethereum';
