// Contract service for interacting with LendingPool and InterestRateOracle
import { ethers } from 'ethers';
import { LENDING_POOL_ABI, INTEREST_RATE_ORACLE_ABI, ERC20_ABI } from './abis';
import { getContractAddresses } from './addresses';

class ContractService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.lendingPool = null;
    this.interestRateOracle = null;
    this.chainId = null;
  }

  // Initialize with provider and signer
  async initialize(provider, signer) {
    this.provider = provider;
    this.signer = signer;
    
    const network = await provider.getNetwork();
    this.chainId = Number(network.chainId);
    
    const addresses = getContractAddresses(this.chainId);
    if (!addresses) {
      throw new Error(`Unsupported network: ${this.chainId}`);
    }

    if (addresses.lendingPool) {
      this.lendingPool = new ethers.Contract(
        addresses.lendingPool,
        LENDING_POOL_ABI,
        signer
      );
    }

    if (addresses.interestRateOracle) {
      this.interestRateOracle = new ethers.Contract(
        addresses.interestRateOracle,
        INTEREST_RATE_ORACLE_ABI,
        signer
      );
    }

    return this;
  }

  // Check if contracts are initialized
  isInitialized() {
    return this.lendingPool !== null && this.interestRateOracle !== null;
  }

  // ============ Lending Pool Functions ============

  // Deposit assets into the lending pool
  async deposit(assetAddress, amount, isETH = false) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const amountWei = ethers.parseEther(amount.toString());

    if (isETH) {
      // Native ETH deposit
      const tx = await this.lendingPool.deposit(assetAddress, amountWei, {
        value: amountWei,
      });
      return await tx.wait();
    } else {
      // ERC20 deposit - need to approve first
      const token = new ethers.Contract(assetAddress, ERC20_ABI, this.signer);
      const addresses = getContractAddresses(this.chainId);
      
      // Check allowance
      const signerAddress = await this.signer.getAddress();
      const allowance = await token.allowance(signerAddress, addresses.lendingPool);
      
      if (allowance < amountWei) {
        const approveTx = await token.approve(addresses.lendingPool, amountWei);
        await approveTx.wait();
      }

      const tx = await this.lendingPool.deposit(assetAddress, amountWei);
      return await tx.wait();
    }
  }

  // Withdraw assets from the lending pool
  async withdraw(assetAddress, amount) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const amountWei = ethers.parseEther(amount.toString());
    const tx = await this.lendingPool.withdraw(assetAddress, amountWei);
    return await tx.wait();
  }

  // Borrow assets from the lending pool
  async borrow(assetAddress, amount) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const amountWei = ethers.parseEther(amount.toString());
    const tx = await this.lendingPool.borrow(assetAddress, amountWei);
    return await tx.wait();
  }

  // Repay borrowed assets
  async repay(assetAddress, amount, isETH = false) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const amountWei = ethers.parseEther(amount.toString());

    if (isETH) {
      const tx = await this.lendingPool.repay(assetAddress, amountWei, {
        value: amountWei,
      });
      return await tx.wait();
    } else {
      // ERC20 repay - need to approve first
      const token = new ethers.Contract(assetAddress, ERC20_ABI, this.signer);
      const addresses = getContractAddresses(this.chainId);
      
      const signerAddress = await this.signer.getAddress();
      const allowance = await token.allowance(signerAddress, addresses.lendingPool);
      
      if (allowance < amountWei) {
        const approveTx = await token.approve(addresses.lendingPool, amountWei);
        await approveTx.wait();
      }

      const tx = await this.lendingPool.repay(assetAddress, amountWei);
      return await tx.wait();
    }
  }

  // Liquidate an undercollateralized position
  async liquidate(borrowerAddress, assetAddress, repayAmount) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const amountWei = ethers.parseEther(repayAmount.toString());
    const tx = await this.lendingPool.liquidate(borrowerAddress, assetAddress, {
      value: amountWei,
    });
    return await tx.wait();
  }

  // Get user's deposit balance
  async getUserDeposit(userAddress, assetAddress) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const deposit = await this.lendingPool.getUserDeposit(userAddress, assetAddress);
    return ethers.formatEther(deposit);
  }

  // Get user's borrow details
  async getUserBorrow(userAddress, assetAddress) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const [principal, interestAccrued, interestRate, lastUpdateTime] = 
      await this.lendingPool.getUserBorrow(userAddress, assetAddress);
    
    return {
      principal: ethers.formatEther(principal),
      interestAccrued: ethers.formatEther(interestAccrued),
      interestRate: Number(interestRate) / 10000, // Convert from basis points
      lastUpdateTime: new Date(Number(lastUpdateTime) * 1000),
    };
  }

  // Get user's health factor
  async getHealthFactor(userAddress) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const healthFactor = await this.lendingPool.getHealthFactor(userAddress);
    return ethers.formatEther(healthFactor);
  }

  // Get asset pool data
  async getAssetData(assetAddress) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const [totalSupply, totalBorrowed, utilizationRate, supplyAPY, borrowAPY] = 
      await this.lendingPool.getAssetData(assetAddress);
    
    return {
      totalSupply: ethers.formatEther(totalSupply),
      totalBorrowed: ethers.formatEther(totalBorrowed),
      utilizationRate: Number(utilizationRate) / 10000,
      supplyAPY: Number(supplyAPY) / 10000,
      borrowAPY: Number(borrowAPY) / 10000,
    };
  }

  // Get user's total collateral value
  async getUserTotalCollateralValue(userAddress) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const value = await this.lendingPool.getUserTotalCollateralValue(userAddress);
    return ethers.formatEther(value);
  }

  // Get user's total borrow value
  async getUserTotalBorrowValue(userAddress) {
    if (!this.lendingPool) throw new Error('Contracts not initialized');

    const value = await this.lendingPool.getUserTotalBorrowValue(userAddress);
    return ethers.formatEther(value);
  }

  // ============ Interest Rate Oracle Functions ============

  // Get current interest rate for an asset
  async getInterestRate(assetAddress) {
    if (!this.interestRateOracle) throw new Error('Contracts not initialized');

    const rate = await this.interestRateOracle.getInterestRate(assetAddress);
    return Number(rate) / 10000; // Convert from basis points
  }

  // Get volatility for an asset
  async getVolatility(assetAddress) {
    if (!this.interestRateOracle) throw new Error('Contracts not initialized');

    const volatility = await this.interestRateOracle.getVolatility(assetAddress);
    return Number(volatility) / 10000;
  }

  // Get full rate data for an asset
  async getRateData(assetAddress) {
    if (!this.interestRateOracle) throw new Error('Contracts not initialized');

    const [interestRate, volatility, lastUpdateTime, isStale] = 
      await this.interestRateOracle.getRateData(assetAddress);
    
    return {
      interestRate: Number(interestRate) / 10000,
      volatility: Number(volatility) / 10000,
      lastUpdateTime: new Date(Number(lastUpdateTime) * 1000),
      isStale,
    };
  }

  // ============ Token Functions ============

  // Get ERC20 token balance
  async getTokenBalance(tokenAddress, userAddress) {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    const balance = await token.balanceOf(userAddress);
    const decimals = await token.decimals();
    return ethers.formatUnits(balance, decimals);
  }

  // Get ETH balance
  async getETHBalance(userAddress) {
    const balance = await this.provider.getBalance(userAddress);
    return ethers.formatEther(balance);
  }

  // Approve token spending
  async approveToken(tokenAddress, spenderAddress, amount) {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
    const decimals = await token.decimals();
    const amountWei = ethers.parseUnits(amount.toString(), decimals);
    
    const tx = await token.approve(spenderAddress, amountWei);
    return await tx.wait();
  }

  // ============ Event Listeners ============

  // Listen for Deposit events
  onDeposit(callback) {
    if (!this.lendingPool) return;
    
    this.lendingPool.on('Deposit', (user, asset, amount, event) => {
      callback({
        user,
        asset,
        amount: ethers.formatEther(amount),
        transactionHash: event.log.transactionHash,
      });
    });
  }

  // Listen for Borrow events
  onBorrow(callback) {
    if (!this.lendingPool) return;
    
    this.lendingPool.on('Borrow', (user, asset, amount, interestRate, event) => {
      callback({
        user,
        asset,
        amount: ethers.formatEther(amount),
        interestRate: Number(interestRate) / 10000,
        transactionHash: event.log.transactionHash,
      });
    });
  }

  // Listen for interest rate updates
  onInterestRateUpdated(callback) {
    if (!this.interestRateOracle) return;
    
    this.interestRateOracle.on('InterestRateUpdated', (asset, rate, volatility, timestamp, event) => {
      callback({
        asset,
        interestRate: Number(rate) / 10000,
        volatility: Number(volatility) / 10000,
        timestamp: new Date(Number(timestamp) * 1000),
        transactionHash: event.log.transactionHash,
      });
    });
  }

  // Remove all event listeners
  removeAllListeners() {
    if (this.lendingPool) {
      this.lendingPool.removeAllListeners();
    }
    if (this.interestRateOracle) {
      this.interestRateOracle.removeAllListeners();
    }
  }
}

// Export singleton instance
export const contractService = new ContractService();

export default contractService;
