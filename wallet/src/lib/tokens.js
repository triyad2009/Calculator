/**
 * Curated ERC-20 token registry. Balances are read straight from the chain with
 * `eth_call` (balanceOf / decimals / symbol) — nothing is trusted from this file
 * except the contract address and the CoinGecko id used for pricing.
 */
export const ERC20_TOKENS = [
  // Ethereum
  { chainId: 1, address: '0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', decimals: 18, coingeckoId: 'tether', name: 'Tether USD' },
  { chainId: 1, address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin', name: 'USD Coin' },
  { chainId: 1, address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC', decimals: 8, coingeckoId: 'wrapped-bitcoin', name: 'Wrapped BTC' },
  { chainId: 1, address: '0x6b175474e89094c44da98b954eedeac495271d0f', symbol: 'DAI', decimals: 18, coingeckoId: 'dai', name: 'Dai' },
  { chainId: 1, address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', symbol: 'WETH', decimals: 18, coingeckoId: 'weth', name: 'Wrapped Ether' },
  { chainId: 1, address: '0x514910771af9ca656af840dff83e8264ecf986ca', symbol: 'LINK', decimals: 18, coingeckoId: 'chainlink', name: 'Chainlink' },
  { chainId: 1, address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', symbol: 'UNI', decimals: 18, coingeckoId: 'uniswap', name: 'Uniswap' },

  // Base
  { chainId: 8453, address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin', name: 'USD Coin' },
  { chainId: 8453, address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', symbol: 'DAI', decimals: 18, coingeckoId: 'dai', name: 'Dai' },

  // Polygon
  { chainId: 137, address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin', name: 'USD Coin' },
  { chainId: 137, address: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', symbol: 'USDT', decimals: 6, coingeckoId: 'tether', name: 'Tether USD' },

  // Arbitrum
  { chainId: 42161, address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin', name: 'USD Coin' },
  { chainId: 42161, address: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', symbol: 'USDT', decimals: 6, coingeckoId: 'tether', name: 'Tether USD' },

  // OP Mainnet
  { chainId: 10, address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin', name: 'USD Coin' },

  // BNB Smart Chain
  { chainId: 56, address: '0x55d398326f99059ff775485246999027b3197955', symbol: 'USDT', decimals: 18, coingeckoId: 'tether', name: 'Tether USD' },

  // Avalanche
  { chainId: 43114, address: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin', name: 'USD Coin' },

  // Sepolia (test USDC so the testnet flow is exercisable)
  { chainId: 11155111, address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin', name: 'USD Coin (test)' },
];

export const tokensForChain = (chainId) => ERC20_TOKENS.filter((t) => t.chainId === chainId);
