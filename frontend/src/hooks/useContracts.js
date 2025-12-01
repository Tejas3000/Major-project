import { useState, useEffect, useCallback } from 'react';
import { contractService } from '../contracts';
import { useWallet } from '../context/WalletContext';

// Hook for using the contract service
export function useContracts() {
  const { provider, signer, account, chainId } = useWallet();
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initContracts = async () => {
      if (provider && signer && chainId) {
        try {
          await contractService.initialize(provider, signer);
          setIsInitialized(true);
          setError(null);
        } catch (err) {
          console.error('Failed to initialize contracts:', err);
          setError(err.message);
          setIsInitialized(false);
        }
      } else {
        setIsInitialized(false);
      }
    };

    initContracts();

    return () => {
      contractService.removeAllListeners();
    };
  }, [provider, signer, chainId]);

  return { contractService, isInitialized, error };
}

// Hook for getting user's lending positions
export function useUserPositions() {
  const { account } = useWallet();
  const { contractService, isInitialized } = useContracts();
  const [deposits, setDeposits] = useState([]);
  const [borrows, setBorrows] = useState([]);
  const [healthFactor, setHealthFactor] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPositions = useCallback(async () => {
    if (!isInitialized || !account) return;

    setLoading(true);
    try {
      const hf = await contractService.getHealthFactor(account);
      setHealthFactor(hf);
      
      // In a real implementation, you would fetch all user positions
      // This is a placeholder for demonstration
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    } finally {
      setLoading(false);
    }
  }, [isInitialized, account, contractService]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return { deposits, borrows, healthFactor, loading, refetch: fetchPositions };
}

// Hook for getting pool statistics
export function usePoolStats(assetAddress) {
  const { contractService, isInitialized } = useContracts();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!isInitialized || !assetAddress) return;

    setLoading(true);
    setError(null);
    
    try {
      const data = await contractService.getAssetData(assetAddress);
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch pool stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isInitialized, assetAddress, contractService]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

// Hook for interest rate data
export function useInterestRate(assetAddress) {
  const { contractService, isInitialized } = useContracts();
  const [rateData, setRateData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchRate = useCallback(async () => {
    if (!isInitialized || !assetAddress) return;

    setLoading(true);
    try {
      const data = await contractService.getRateData(assetAddress);
      setRateData(data);
    } catch (err) {
      console.error('Failed to fetch interest rate:', err);
    } finally {
      setLoading(false);
    }
  }, [isInitialized, assetAddress, contractService]);

  useEffect(() => {
    fetchRate();
    
    // Set up listener for rate updates
    if (isInitialized) {
      contractService.onInterestRateUpdated((event) => {
        if (event.asset.toLowerCase() === assetAddress?.toLowerCase()) {
          setRateData({
            interestRate: event.interestRate,
            volatility: event.volatility,
            lastUpdateTime: event.timestamp,
            isStale: false,
          });
        }
      });
    }
  }, [fetchRate, isInitialized, assetAddress]);

  return { rateData, loading, refetch: fetchRate };
}

// Hook for transaction handling
export function useTransaction() {
  const [pending, setPending] = useState(false);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);

  const execute = useCallback(async (txFunction) => {
    setPending(true);
    setTxHash(null);
    setError(null);

    try {
      const receipt = await txFunction();
      setTxHash(receipt.hash);
      return receipt;
    } catch (err) {
      console.error('Transaction failed:', err);
      setError(err.message || 'Transaction failed');
      throw err;
    } finally {
      setPending(false);
    }
  }, []);

  const reset = useCallback(() => {
    setPending(false);
    setTxHash(null);
    setError(null);
  }, []);

  return { execute, pending, txHash, error, reset };
}

// Hook for token balances
export function useTokenBalance(tokenAddress) {
  const { account } = useWallet();
  const { contractService, isInitialized } = useContracts();
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!isInitialized || !account || !tokenAddress) return;

    setLoading(true);
    try {
      const bal = await contractService.getTokenBalance(tokenAddress, account);
      setBalance(bal);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    } finally {
      setLoading(false);
    }
  }, [isInitialized, account, tokenAddress, contractService]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { balance, loading, refetch: fetchBalance };
}

// Hook for ETH balance
export function useETHBalance() {
  const { account } = useWallet();
  const { contractService, isInitialized } = useContracts();
  const [balance, setBalance] = useState('0');
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!isInitialized || !account) return;

    setLoading(true);
    try {
      const bal = await contractService.getETHBalance(account);
      setBalance(bal);
    } catch (err) {
      console.error('Failed to fetch ETH balance:', err);
    } finally {
      setLoading(false);
    }
  }, [isInitialized, account, contractService]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return { balance, loading, refetch: fetchBalance };
}
