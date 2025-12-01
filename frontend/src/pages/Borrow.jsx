import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiDollarSign, FiShield, FiAlertTriangle, FiInfo, FiCpu } from 'react-icons/fi';
import { useWallet } from '../context/WalletContext';
import { poolApi, interestRateApi, marketApi } from '../services/api';
import toast from 'react-hot-toast';

const supportedAssets = [
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: 'from-blue-500 to-indigo-600' },
    { id: 'bitcoin', symbol: 'WBTC', name: 'Wrapped Bitcoin', icon: '₿', color: 'from-orange-500 to-amber-600' },
    { id: 'matic-network', symbol: 'MATIC', name: 'Polygon', icon: '⬡', color: 'from-purple-500 to-violet-600' },
];

export default function Borrow() {
    const { isConnected, account } = useWallet();
    const [borrowAsset, setBorrowAsset] = useState(supportedAssets[0]);
    const [collateralAsset, setCollateralAsset] = useState(supportedAssets[1]);
    const [borrowAmount, setBorrowAmount] = useState('');
    const [collateralAmount, setCollateralAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [interestRate, setInterestRate] = useState(null);
    const [borrowRate, setBorrowRate] = useState(null);

    useEffect(() => {
        fetchRates();
    }, [borrowAsset]);

    useEffect(() => {
        if (borrowAmount && collateralAmount) {
            calculateBorrowRate();
        }
    }, [borrowAmount, collateralAmount, borrowAsset, collateralAsset]);

    const fetchRates = async () => {
        try {
            const rate = await interestRateApi.getInterestRate(borrowAsset.id);
            setInterestRate(rate);
        } catch (error) {
            console.error('Error fetching rates:', error);
            setInterestRate({
                effective_rate: 0.068,
                apy: 0.0703,
                base_rate: 0.02,
                volatility_premium: 0.025,
                utilization_factor: 0.018,
                risk_adjustment: 0.005,
            });
        }
    };

    const calculateBorrowRate = async () => {
        if (!borrowAmount || !collateralAmount) return;

        // Calculate health factor and adjusted rate
        const borrow = parseFloat(borrowAmount);
        const collateral = parseFloat(collateralAmount);

        // Simplified calculation (in production, use actual prices)
        const collateralRatio = collateral / borrow;
        let rateAdjustment = 0;

        if (collateralRatio >= 2.0) {
            rateAdjustment = -0.005;
        } else if (collateralRatio >= 1.5) {
            rateAdjustment = 0;
        } else if (collateralRatio >= 1.25) {
            rateAdjustment = 0.02;
        } else {
            rateAdjustment = 0.05;
        }

        const baseRate = interestRate?.effective_rate || 0.068;
        const finalRate = Math.max(0.01, Math.min(0.30, baseRate + rateAdjustment));

        setBorrowRate({
            base_rate: baseRate,
            rate_adjustment: rateAdjustment,
            final_rate: finalRate,
            collateral_ratio: collateralRatio,
            health_factor: collateralRatio / 1.15,
        });
    };

    const handleBorrow = async () => {
        if (!isConnected) {
            toast.error('Please connect your wallet first');
            return;
        }

        if (!borrowAmount || !collateralAmount) {
            toast.error('Please enter both borrow and collateral amounts');
            return;
        }

        if (borrowRate?.health_factor < 1.1) {
            toast.error('Health factor too low. Add more collateral.');
            return;
        }

        setLoading(true);
        try {
            const txData = await poolApi.borrow({
                wallet_address: account,
                cryptocurrency: borrowAsset.id,
                amount: parseFloat(borrowAmount),
                collateral_amount: parseFloat(collateralAmount),
                collateral_type: collateralAsset.id,
            });

            toast.success(`Borrow prepared! Interest Rate: ${(txData.interest_rate * 100).toFixed(2)}%`);

            setBorrowAmount('');
            setCollateralAmount('');
            setBorrowRate(null);
        } catch (error) {
            console.error('Error borrowing:', error);
            toast.error('Failed to borrow assets');
        } finally {
            setLoading(false);
        }
    };

    const getHealthStatus = (healthFactor) => {
        if (!healthFactor) return { color: 'text-gray-400', bg: 'bg-gray-600', label: 'N/A' };
        if (healthFactor >= 2) return { color: 'text-accent-green', bg: 'bg-accent-green', label: 'Healthy' };
        if (healthFactor >= 1.5) return { color: 'text-amber-400', bg: 'bg-amber-400', label: 'Moderate' };
        if (healthFactor >= 1.1) return { color: 'text-orange-500', bg: 'bg-orange-500', label: 'At Risk' };
        return { color: 'text-accent-red', bg: 'bg-accent-red', label: 'Danger' };
    };

    const healthStatus = getHealthStatus(borrowRate?.health_factor);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Borrow Assets</h1>
                <p className="text-gray-400 mt-1">Borrow with ML-powered variable interest rates</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Borrow Form */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="lg:col-span-2 card"
                >
                    <h2 className="text-xl font-semibold text-white mb-6">Create Borrow Position</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Borrow Asset */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-3">Asset to Borrow</label>
                            <div className="space-y-3">
                                {supportedAssets.map((asset) => (
                                    <button
                                        key={asset.id}
                                        onClick={() => setBorrowAsset(asset)}
                                        className={`w-full p-3 rounded-xl border flex items-center space-x-3 transition-all duration-200 ${borrowAsset.id === asset.id
                                                ? 'border-primary-500 bg-primary-500/10'
                                                : 'border-gray-700 hover:border-gray-600 bg-dark-300'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${asset.color} flex items-center justify-center`}>
                                            {asset.icon}
                                        </div>
                                        <div className="text-left">
                                            <p className="font-semibold text-white">{asset.symbol}</p>
                                            <p className="text-xs text-gray-400">{asset.name}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Collateral Asset */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-3">Collateral Asset</label>
                            <div className="space-y-3">
                                {supportedAssets.filter(a => a.id !== borrowAsset.id).map((asset) => (
                                    <button
                                        key={asset.id}
                                        onClick={() => setCollateralAsset(asset)}
                                        className={`w-full p-3 rounded-xl border flex items-center space-x-3 transition-all duration-200 ${collateralAsset.id === asset.id
                                                ? 'border-accent-purple bg-accent-purple/10'
                                                : 'border-gray-700 hover:border-gray-600 bg-dark-300'
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${asset.color} flex items-center justify-center`}>
                                            {asset.icon}
                                        </div>
                                        <div className="text-left">
                                            <p className="font-semibold text-white">{asset.symbol}</p>
                                            <p className="text-xs text-gray-400">{asset.name}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Amount Inputs */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-3">Borrow Amount</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={borrowAmount}
                                    onChange={(e) => setBorrowAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="input-primary text-xl font-mono pr-16"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                                    {borrowAsset.symbol}
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-3">Collateral Amount</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={collateralAmount}
                                    onChange={(e) => setCollateralAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="input-primary text-xl font-mono pr-16"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                                    {collateralAsset.symbol}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Health Factor Display */}
                    {borrowRate && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-6 p-4 bg-dark-300 rounded-xl"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center space-x-2">
                                    <FiShield className={`w-5 h-5 ${healthStatus.color}`} />
                                    <span className="font-medium text-white">Health Factor</span>
                                </div>
                                <div className={`px-3 py-1 rounded-lg ${healthStatus.bg}/20 ${healthStatus.color}`}>
                                    {healthStatus.label}
                                </div>
                            </div>

                            <div className="flex items-center space-x-4">
                                <div className="flex-1">
                                    <div className="h-3 bg-dark-400 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${healthStatus.bg} transition-all duration-500`}
                                            style={{ width: `${Math.min(100, (borrowRate.health_factor / 3) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                                <span className={`text-2xl font-bold ${healthStatus.color}`}>
                                    {borrowRate.health_factor.toFixed(2)}
                                </span>
                            </div>

                            <p className="text-xs text-gray-500 mt-2">
                                Liquidation occurs below 1.0. Keep above 1.5 for safety.
                            </p>

                            {borrowRate.health_factor < 1.5 && (
                                <div className="mt-4 p-3 bg-accent-red/10 border border-accent-red/20 rounded-lg flex items-start space-x-2">
                                    <FiAlertTriangle className="w-5 h-5 text-accent-red flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-accent-red">
                                        Your position is at risk of liquidation. Consider adding more collateral.
                                    </p>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Borrow Button */}
                    <button
                        onClick={handleBorrow}
                        disabled={loading || !isConnected || !borrowAmount || !collateralAmount || (borrowRate?.health_factor < 1.1)}
                        className="w-full mt-6 btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        ) : (
                            <>
                                <FiDollarSign className="w-5 h-5" />
                                <span>{isConnected ? 'Borrow' : 'Connect Wallet to Borrow'}</span>
                            </>
                        )}
                    </button>
                </motion.div>

                {/* Rate Info Sidebar */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-6"
                >
                    {/* Current Rate */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-white">Borrow Rate</h3>
                            <div className="flex items-center text-accent-green text-xs">
                                <FiCpu className="w-3 h-3 mr-1" />
                                ML-Powered
                            </div>
                        </div>
                        <p className="text-4xl font-bold text-primary-400">
                            {((borrowRate?.final_rate || interestRate?.effective_rate || 0.068) * 100).toFixed(2)}%
                        </p>
                        <p className="text-sm text-gray-400 mt-2">
                            Variable rate based on market conditions
                        </p>
                    </div>

                    {/* Rate Breakdown */}
                    {borrowRate && (
                        <div className="card">
                            <h3 className="font-semibold text-white mb-4">Rate Breakdown</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Base Rate</span>
                                    <span className="text-white">{(borrowRate.base_rate * 100).toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Collateral Adjustment</span>
                                    <span className={borrowRate.rate_adjustment >= 0 ? 'text-accent-red' : 'text-accent-green'}>
                                        {borrowRate.rate_adjustment >= 0 ? '+' : ''}{(borrowRate.rate_adjustment * 100).toFixed(2)}%
                                    </span>
                                </div>
                                <div className="border-t border-gray-700 pt-3">
                                    <div className="flex justify-between">
                                        <span className="font-medium text-white">Final Rate</span>
                                        <span className="font-bold text-primary-400">{(borrowRate.final_rate * 100).toFixed(2)}%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Collateral Requirements */}
                    <div className="card">
                        <h3 className="font-semibold text-white mb-4">Collateral Requirements</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Min Collateral Ratio</span>
                                <span className="text-white">150%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Liquidation Threshold</span>
                                <span className="text-white">115%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Liquidation Penalty</span>
                                <span className="text-accent-red">5%</span>
                            </div>
                        </div>
                    </div>

                    {/* Info Box */}
                    <div className="card bg-primary-600/10 border-primary-500/20">
                        <div className="flex items-start space-x-3">
                            <FiInfo className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-medium text-primary-400">Variable Rates</h4>
                                <p className="text-sm text-gray-400 mt-1">
                                    Interest rates are calculated using LSTM predictions of market volatility, ensuring fair rates for all borrowers.
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
