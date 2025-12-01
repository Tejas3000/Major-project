// Contract addresses for different networks
// Update these after deploying your contracts

export const CONTRACTS = {
  // Ethereum Mainnet
  1: {
    lendingPool: '',  // Update after deployment
    interestRateOracle: '',  // Update after deployment
    tokens: {
      WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      DAI: '0x6B175474E89094C44Da98b954EescdeCB5BE3d823',
    }
  },
  
  // Sepolia Testnet
  11155111: {
    lendingPool: '',  // Update after deployment
    interestRateOracle: '',  // Update after deployment
    tokens: {
      WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      USDC: '0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8',
    }
  },
  
  // Goerli Testnet (Deprecated but included for reference)
  5: {
    lendingPool: '',
    interestRateOracle: '',
    tokens: {
      WETH: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6',
    }
  },
  
  // Polygon Mainnet
  137: {
    lendingPool: '',
    interestRateOracle: '',
    tokens: {
      WMATIC: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    }
  },
  
  // Mumbai Testnet (Polygon)
  80001: {
    lendingPool: '',
    interestRateOracle: '',
    tokens: {
      WMATIC: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
    }
  },
  
  // Local Development (Hardhat)
  31337: {
    lendingPool: '0x5FbDB2315678afecb367f032d93F642f64180aa3',  // Default Hardhat deploy address
    interestRateOracle: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    tokens: {
      WETH: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    }
  },
};

// Get contract addresses for a specific network
export const getContractAddresses = (chainId) => {
  const addresses = CONTRACTS[chainId];
  if (!addresses) {
    console.warn(`No contract addresses configured for chain ID: ${chainId}`);
    return null;
  }
  return addresses;
};

// Supported networks for the platform
export const SUPPORTED_NETWORKS = {
  1: {
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    currency: 'ETH',
    explorer: 'https://etherscan.io',
    rpc: 'https://eth-mainnet.g.alchemy.com/v2/',
  },
  11155111: {
    name: 'Sepolia Testnet',
    shortName: 'Sepolia',
    currency: 'SepoliaETH',
    explorer: 'https://sepolia.etherscan.io',
    rpc: 'https://eth-sepolia.g.alchemy.com/v2/',
  },
  137: {
    name: 'Polygon Mainnet',
    shortName: 'Polygon',
    currency: 'MATIC',
    explorer: 'https://polygonscan.com',
    rpc: 'https://polygon-mainnet.g.alchemy.com/v2/',
  },
  80001: {
    name: 'Mumbai Testnet',
    shortName: 'Mumbai',
    currency: 'MATIC',
    explorer: 'https://mumbai.polygonscan.com',
    rpc: 'https://polygon-mumbai.g.alchemy.com/v2/',
  },
  31337: {
    name: 'Hardhat Local',
    shortName: 'Localhost',
    currency: 'ETH',
    explorer: '',
    rpc: 'http://127.0.0.1:8545',
  },
};

export const getNetworkInfo = (chainId) => {
  return SUPPORTED_NETWORKS[chainId] || null;
};

export const isSupportedNetwork = (chainId) => {
  return chainId in SUPPORTED_NETWORKS;
};

export default {
  CONTRACTS,
  getContractAddresses,
  SUPPORTED_NETWORKS,
  getNetworkInfo,
  isSupportedNetwork,
};
