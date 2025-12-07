import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiTrendingUp, FiInfo, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import { useWallet } from '../context/WalletContext';
import { poolApi, interestRateApi, marketApi } from '../services/api';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';

const supportedAssets = [
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: 'from-blue-500 to-indigo-600' },
    { id: 'bitcoin', symbol: 'WBTC', name: 'Wrapped Bitcoin', icon: '₿', color: 'from-orange-500 to-amber-600' },
    { id: 'usdt', symbol: 'USDT', name: 'Tether USD', icon: '₮', color: 'from-green-500 to-emerald-600', isStablecoin: true },
];

export default function Lend() {
    const { isConnected, account, signer, provider } = useWallet();
    const [selectedAsset, setSelectedAsset] = useState(supportedAssets[0]);
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [poolStats, setPoolStats] = useState(null);
    const [interestRate, setInterestRate] = useState(null);
    const [userBalance, setUserBalance] = useState('0');
    const [balanceLoading, setBalanceLoading] = useState(false);

    useEffect(() => {
        fetchPoolData();
    }, [selectedAsset]);

    // Fetch wallet balance when account or selected asset changes
    useEffect(() => {
        if (isConnected && account && provider) {
            fetchWalletBalance();
        } else {
            setUserBalance('0');
        }
    }, [isConnected, account, provider, selectedAsset]);

    const fetchWalletBalance = async () => {
        if (!provider || !account) return;

        setBalanceLoading(true);
        try {
            if (selectedAsset.symbol === 'ETH') {
                // Get native ETH balance
                const balance = await provider.getBalance(account);
                setUserBalance(ethers.formatEther(balance));
            } else if (selectedAsset.symbol === 'WBTC' || selectedAsset.symbol === 'USDT') {
                // For ERC20 tokens, we would need the token contract address
                // For now, show 0 as we don't have actual token contracts
                setUserBalance('0');
            } else {
                setUserBalance('0');
            }
        } catch (error) {
            console.error('Error fetching wallet balance:', error);
            setUserBalance('0');
        } finally {
            setBalanceLoading(false);
        }
    };

    const fetchPoolData = async () => {
        try {
            // For stablecoins, use fixed rates
            if (selectedAsset.isStablecoin) {
                setPoolStats({
                    total_supplied: 50000,
                    total_borrowed: 35000,
                    utilization_rate: 0.70,
                    available_liquidity: 15000,
                    supply_apy: 0.038,
                });
                setInterestRate({
                    effective_rate: 0.045,
                    apy: 0.046,
                });
                return;
            }

            const [stats, rate] = await Promise.all([
                poolApi.getPoolStats(selectedAsset.id),
                interestRateApi.getInterestRate(selectedAsset.id),
            ]);
            setPoolStats(stats);
            setInterestRate(rate);
        } catch (error) {
            console.error('Error fetching pool data:', error);
            // Mock data
            setPoolStats({
                total_supplied: 15000,
                total_borrowed: 9750,
                utilization_rate: 0.65,
                available_liquidity: 5250,
                supply_apy: 0.045,
            });
            setInterestRate({
                effective_rate: 0.068,
                apy: 0.0703,
            });
        }
    };

    const handleSupply = async () => {
        if (!isConnected) {
            toast.error('Please connect your wallet first');
            return;
        }

        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        // Check if user has enough balance
        const amountToSupply = parseFloat(amount);
        const availableBalance = parseFloat(userBalance);

        if (amountToSupply > availableBalance) {
            toast.error(`Insufficient balance. You have ${availableBalance.toFixed(6)} ${selectedAsset.symbol}`);
            return;
        }

        // Leave some ETH for gas fees
        if (selectedAsset.symbol === 'ETH' && amountToSupply > availableBalance - 0.01) {
            toast.error('Please leave some ETH for gas fees');
            return;
        }

        setLoading(true);
        try {
            // Prepare transaction via API
            const txData = await poolApi.supply({
                wallet_address: account,
                cryptocurrency: selectedAsset.id,
                amount: parseFloat(amount),
            });

            toast.success(`Supply prepared! Expected APY: ${(txData.transaction_data.expected_apy * 100).toFixed(2)}%`);

            // In production, you would send this transaction via MetaMask
            // const tx = await signer.sendTransaction(txData.transaction_data);
            // await tx.wait();

            setAmount('');
            fetchPoolData();
        } catch (error) {
            console.error('Error supplying:', error);
            toast.error('Failed to supply assets');
        } finally {
            setLoading(false);
        }
    };

    const calculateEarnings = () => {
        const principal = parseFloat(amount);
        if (!amount || isNaN(principal) || principal <= 0 || !interestRate) {
            return { daily: '0.000000', monthly: '0.0000', yearly: '0.0000' };
        }
        const apy = poolStats?.supply_apy || interestRate.apy * 0.9 || 0;

        if (isNaN(apy) || apy <= 0) {
            return { daily: '0.000000', monthly: '0.0000', yearly: '0.0000' };
        }

        const daily = principal * apy / 365;
        const monthly = principal * apy / 12;
        const yearly = principal * apy;

        return {
            daily: isNaN(daily) ? '0.000000' : daily.toFixed(6),
            monthly: isNaN(monthly) ? '0.0000' : monthly.toFixed(4),
            yearly: isNaN(yearly) ? '0.0000' : yearly.toFixed(4),
        };
    };

    const earnings = calculateEarnings();

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Lend Assets</h1>
                <p className="text-gray-400 mt-1">Supply assets to earn variable interest powered by ML predictions</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Supply Form */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="lg:col-span-2 card"
                >
                    <h2 className="text-xl font-semibold text-white mb-6">Supply Assets</h2>

                    {/* Asset Selection */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-400 mb-3">Select Asset</label>
                        <div className="grid grid-cols-3 gap-4">
                            {supportedAssets.map((asset) => (
                                <button
                                    key={asset.id}
                                    onClick={() => setSelectedAsset(asset)}
                                    className={`p-4 rounded-xl border transition-all duration-200 ${selectedAsset.id === asset.id
                                        ? 'border-primary-500 bg-primary-500/10'
                                        : 'border-gray-700 hover:border-gray-600 bg-dark-300'
                                        }`}
                                >
                                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${asset.color} flex items-center justify-center text-xl mb-2`}>
                                        {asset.icon}
                                    </div>
                                    <p className="font-semibold text-white">{asset.symbol}</p>
                                    <p className="text-xs text-gray-400">{asset.name}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Amount Input */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-400 mb-3">Amount</label>
                        <div className="relative">
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className={`input-primary text-2xl font-mono pr-24 ${amount && parseFloat(amount) > parseFloat(userBalance)
                                    ? 'border-red-500 focus:border-red-500'
                                    : ''
                                    }`}
                            />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                                <span className="text-gray-400 font-semibold">{selectedAsset.symbol}</span>
                                <button
                                    onClick={() => {
                                        // Leave some for gas if ETH
                                        const maxAmount = selectedAsset.symbol === 'ETH'
                                            ? Math.max(0, parseFloat(userBalance) - 0.01).toFixed(6)
                                            : userBalance;
                                        setAmount(maxAmount);
                                    }}
                                    className="px-2 py-1 bg-primary-600/20 text-primary-400 text-xs rounded-lg hover:bg-primary-600/30"
                                >
                                    MAX
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-sm text-gray-500">
                                Wallet Balance: {balanceLoading ? 'Loading...' : `${parseFloat(userBalance).toFixed(6)} ${selectedAsset.symbol}`}
                            </p>
                            {amount && parseFloat(amount) > parseFloat(userBalance) && (
                                <p className="text-sm text-red-500 flex items-center">
                                    <FiAlertTriangle className="w-4 h-4 mr-1" />
                                    Insufficient balance
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Earnings Preview */}
                    {amount && !isNaN(parseFloat(amount)) && parseFloat(amount) > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mb-6 p-4 bg-dark-300 rounded-xl"
                        >
                            <h3 className="text-sm font-medium text-gray-400 mb-3">Estimated Earnings</h3>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <p className="text-xs text-gray-500">Daily</p>
                                    <p className="text-lg font-semibold text-accent-green">
                                        +{earnings.daily} {selectedAsset.symbol}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Monthly</p>
                                    <p className="text-lg font-semibold text-accent-green">
                                        +{earnings.monthly} {selectedAsset.symbol}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Yearly</p>
                                    <p className="text-lg font-semibold text-accent-green">
                                        +{earnings.yearly} {selectedAsset.symbol}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Supply Button */}
                    <button
                        onClick={handleSupply}
                        disabled={loading || !isConnected || !amount}
                        className="w-full btn-success flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <>
                                <FiTrendingUp className="w-5 h-5" />
                                <span>{isConnected ? 'Supply' : 'Connect Wallet to Supply'}</span>
                            </>
                        )}
                    </button>

                    {!isConnected && (
                        <p className="text-center text-sm text-gray-500 mt-4">
                            Please connect your wallet to supply assets
                        </p>
                    )}
                </motion.div>

                {/* Stats Sidebar */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-6"
                >
                    {/* Current APY */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-white">Supply APY</h3>
                            <div className="px-2 py-1 bg-accent-green/20 text-accent-green text-xs rounded-lg">
                                ML-Optimized
                            </div>
                        </div>
                        <p className="text-4xl font-bold text-accent-green">
                            {((poolStats?.supply_apy || 0.045) * 100).toFixed(2)}%
                        </p>
                        <p className="text-sm text-gray-400 mt-2">
                            Based on {((poolStats?.utilization_rate || 0) * 100).toFixed(0)}% utilization
                        </p>
                    </div>

                    {/* Pool Stats */}
                    <div className="card">
                        <h3 className="font-semibold text-white mb-4">Pool Statistics</h3>
                        <div className="space-y-4">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Total Supplied</span>
                                <span className="text-white font-medium">
                                    {poolStats?.total_supplied?.toLocaleString() || '0'} {selectedAsset.symbol}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Total Borrowed</span>
                                <span className="text-white font-medium">
                                    {poolStats?.total_borrowed?.toLocaleString() || '0'} {selectedAsset.symbol}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Available Liquidity</span>
                                <span className="text-accent-green font-medium">
                                    {poolStats?.available_liquidity?.toLocaleString() || '0'} {selectedAsset.symbol}
                                </span>
                            </div>
                            <div className="w-full bg-dark-300 rounded-full h-2 mt-2">
                                <div
                                    className="bg-gradient-to-r from-primary-500 to-accent-purple h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${(poolStats?.utilization_rate || 0) * 100}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 text-center">
                                {((poolStats?.utilization_rate || 0) * 100).toFixed(1)}% Utilization
                            </p>
                        </div>
                    </div>

                    {/* Info Box */}
                    <div className="card bg-primary-600/10 border-primary-500/20">
                        <div className="flex items-start space-x-3">
                            <FiInfo className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-medium text-primary-400">How it works</h4>
                                <p className="text-sm text-gray-400 mt-1">
                                    Supply assets to earn interest. Rates are dynamically adjusted by our ML model based on market volatility and predictions.
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
