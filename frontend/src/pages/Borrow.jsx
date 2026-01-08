import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiDollarSign, FiShield, FiAlertTriangle, FiInfo, FiCpu, FiZap } from 'react-icons/fi';
import { useWallet } from '../context/WalletContext';
import { poolApi, interestRateApi, marketApi, predictionApi } from '../services/api';
import toast from 'react-hot-toast';

// Collateral assets (crypto only)
const collateralAssets = [
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: 'from-blue-500 to-indigo-600' },
    { id: 'bitcoin', symbol: 'WBTC', name: 'Wrapped Bitcoin', icon: '₿', color: 'from-orange-500 to-amber-600' },
];

// Borrow assets (includes stablecoins)
const borrowableAssets = [
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: 'from-blue-500 to-indigo-600' },
    { id: 'bitcoin', symbol: 'WBTC', name: 'Wrapped Bitcoin', icon: '₿', color: 'from-orange-500 to-amber-600' },
    { id: 'usdt', symbol: 'USDT', name: 'Tether USD', icon: '₮', color: 'from-green-500 to-emerald-600', isStablecoin: true, fixedPrice: 1.00 },
];

export default function Borrow() {
    const { isConnected, account } = useWallet();
    const [borrowAsset, setBorrowAsset] = useState(borrowableAssets[0]);
    const [collateralAsset, setCollateralAsset] = useState(collateralAssets[1]);
    const [borrowAmount, setBorrowAmount] = useState('');
    const [collateralAmount, setCollateralAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [interestRate, setInterestRate] = useState(null);
    const [borrowRate, setBorrowRate] = useState(null);
    const [assetPrices, setAssetPrices] = useState({});
    const [pricesLoading, setPricesLoading] = useState(true);
    const [predictions, setPredictions] = useState({});
    const [autoCalculating, setAutoCalculating] = useState(false);
    const [recommendedCollateral, setRecommendedCollateral] = useState(null);

    // Fetch market prices for all assets
    useEffect(() => {
        fetchAssetPrices();
        fetchPredictions();
        const interval = setInterval(() => {
            fetchAssetPrices();
            fetchPredictions();
        }, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        fetchRates();
        // Reset collateral asset if it matches the borrow asset
        if (collateralAsset.id === borrowAsset.id) {
            const availableCollateral = collateralAssets.find(a => a.id !== borrowAsset.id);
            if (availableCollateral) {
                setCollateralAsset(availableCollateral);
            }
        }
    }, [borrowAsset]);

    // Auto-calculate collateral when borrow amount changes
    useEffect(() => {
        if (borrowAmount && Object.keys(assetPrices).length > 0 && Object.keys(predictions).length > 0) {
            calculateRecommendedCollateral();
        }
    }, [borrowAmount, borrowAsset, collateralAsset, assetPrices, predictions, interestRate]);

    useEffect(() => {
        if (borrowAmount && collateralAmount && Object.keys(assetPrices).length > 0) {
            calculateBorrowRate();
        }
    }, [borrowAmount, collateralAmount, borrowAsset, collateralAsset, assetPrices]);

    const fetchPredictions = async () => {
        try {
            const preds = {};
            for (const asset of collateralAssets) {
                try {
                    const prediction = await predictionApi.getPrediction(asset.id);
                    preds[asset.id] = prediction;
                } catch (e) {
                    console.error(`Error fetching prediction for ${asset.id}:`, e);
                }
            }
            setPredictions(preds);
        } catch (error) {
            console.error('Error fetching predictions:', error);
        }
    };

    const fetchAssetPrices = async () => {
        setPricesLoading(true);
        try {
            const prices = {};
            // Fetch prices for collateral assets from API
            for (const asset of collateralAssets) {
                try {
                    const marketData = await marketApi.getMarketData(asset.id);
                    prices[asset.id] = marketData.current_price || 0;
                } catch (e) {
                    // Fallback prices if API fails
                    prices[asset.id] = asset.id === 'ethereum' ? 2500 : asset.id === 'bitcoin' ? 45000 : 1;
                }
            }
            // Add fixed prices for stablecoins
            for (const asset of borrowableAssets) {
                if (asset.isStablecoin) {
                    prices[asset.id] = asset.fixedPrice;
                } else if (!prices[asset.id]) {
                    try {
                        const marketData = await marketApi.getMarketData(asset.id);
                        prices[asset.id] = marketData.current_price || 0;
                    } catch (e) {
                        prices[asset.id] = asset.id === 'ethereum' ? 2500 : asset.id === 'bitcoin' ? 45000 : 1;
                    }
                }
            }
            setAssetPrices(prices);
        } catch (error) {
            console.error('Error fetching prices:', error);
            // Set fallback prices
            setAssetPrices({
                ethereum: 2500,
                bitcoin: 45000,
                usdt: 1.00,
            });
        } finally {
            setPricesLoading(false);
        }
    };

    const fetchRates = async () => {
        try {
            // For stablecoins, use a fixed rate
            if (borrowAsset.isStablecoin) {
                setInterestRate({
                    effective_rate: 0.045,
                    apy: 0.046,
                    base_rate: 0.03,
                    volatility_premium: 0.005,
                    utilization_factor: 0.008,
                    risk_adjustment: 0.002,
                });
                return;
            }
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

    // Calculate recommended collateral based on LSTM predictions and interest rates
    const calculateRecommendedCollateral = () => {
        if (!borrowAmount) return;

        const borrowAmountNum = parseFloat(borrowAmount);
        if (isNaN(borrowAmountNum) || borrowAmountNum <= 0) return;

        const borrowPriceUsd = assetPrices[borrowAsset.id] || 0;
        const collateralPriceUsd = assetPrices[collateralAsset.id] || 0;

        if (borrowPriceUsd === 0 || collateralPriceUsd === 0) return;

        // Get LSTM prediction for collateral asset
        const prediction = predictions[collateralAsset.id];
        const predictedChange = prediction?.predictions?.[0]?.predicted_change || 0; // First prediction (next day)
        const confidence = prediction?.confidence_score || 0.5;
        const trend = prediction?.predictions?.[0]?.trend || 'neutral';

        // Get interest rate factors
        const baseInterestRate = interestRate?.effective_rate || 0.068;
        const volatilityPremium = interestRate?.volatility_premium || 0.02;

        // Calculate borrow value in USD
        const borrowValueUsd = borrowAmountNum * borrowPriceUsd;

        // Base collateral ratio (150% minimum)
        let targetCollateralRatio = 1.5;

        // Adjust based on LSTM prediction
        // If collateral is predicted to go down (bearish), we need MORE collateral
        // If collateral is predicted to go up (bullish), we need LESS collateral
        if (trend === 'bearish') {
            // Add extra buffer based on predicted drop and confidence
            const dropBuffer = Math.abs(predictedChange / 100) * confidence;
            targetCollateralRatio += dropBuffer + 0.2; // Extra 20% safety margin for bearish
        } else if (trend === 'bullish') {
            // Slight reduction if bullish, but maintain safety
            const riseBuffer = Math.abs(predictedChange / 100) * confidence * 0.5; // Only 50% credit for bullish
            targetCollateralRatio = Math.max(1.35, targetCollateralRatio - riseBuffer);
        }

        // Adjust based on interest rate and volatility
        // Higher volatility = more collateral needed
        targetCollateralRatio += volatilityPremium * 2;

        // Adjust based on base interest rate (higher rates = riskier = more collateral)
        if (baseInterestRate > 0.10) {
            targetCollateralRatio += 0.15;
        } else if (baseInterestRate > 0.07) {
            targetCollateralRatio += 0.08;
        }

        // Cap the ratio at reasonable bounds
        targetCollateralRatio = Math.max(1.35, Math.min(2.5, targetCollateralRatio));

        // Calculate required collateral value in USD
        const requiredCollateralValueUsd = borrowValueUsd * targetCollateralRatio;

        // Convert to collateral asset amount
        const requiredCollateralAmount = requiredCollateralValueUsd / collateralPriceUsd;

        setRecommendedCollateral({
            amount: requiredCollateralAmount,
            ratio: targetCollateralRatio,
            prediction: {
                trend,
                change: predictedChange,
                confidence,
            },
            rateFactors: {
                baseRate: baseInterestRate,
                volatility: volatilityPremium,
            },
        });
    };

    // Auto-fill collateral with recommended amount
    const applyRecommendedCollateral = () => {
        if (recommendedCollateral?.amount) {
            setAutoCalculating(true);
            setCollateralAmount(recommendedCollateral.amount.toFixed(6));
            setTimeout(() => setAutoCalculating(false), 500);
        }
    };

    const calculateBorrowRate = async () => {
        if (!borrowAmount || !collateralAmount) return;

        const borrow = parseFloat(borrowAmount);
        const collateral = parseFloat(collateralAmount);

        // Get USD values for both assets
        const borrowPriceUsd = assetPrices[borrowAsset.id] || 0;
        const collateralPriceUsd = assetPrices[collateralAsset.id] || 0;

        // Calculate USD values
        const borrowValueUsd = borrow * borrowPriceUsd;
        const collateralValueUsd = collateral * collateralPriceUsd;

        // Calculate collateral ratio based on USD values
        const collateralRatio = borrowValueUsd > 0 ? collateralValueUsd / borrowValueUsd : 0;

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
            borrow_value_usd: borrowValueUsd,
            collateral_value_usd: collateralValueUsd,
            borrow_price_usd: borrowPriceUsd,
            collateral_price_usd: collateralPriceUsd,
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

            const displayRate = txData.interest_rate != null && !isNaN(txData.interest_rate)
                ? (txData.interest_rate * 100).toFixed(2)
                : borrowAsset.isStablecoin ? '4.60' : '6.80';
            toast.success(`Borrow prepared! Interest Rate: ${displayRate}%`);

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
                                {borrowableAssets.map((asset) => (
                                    <button
                                        key={asset.id}
                                        onClick={() => setBorrowAsset(asset)}
                                        className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all duration-200 ${borrowAsset.id === asset.id
                                            ? 'border-primary-500 bg-primary-500/10'
                                            : 'border-gray-700 hover:border-gray-600 bg-dark-300'
                                            }`}
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${asset.color} flex items-center justify-center`}>
                                                {asset.icon}
                                            </div>
                                            <div className="text-left">
                                                <p className="font-semibold text-white">{asset.symbol}</p>
                                                <p className="text-xs text-gray-400">{asset.name}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {pricesLoading ? (
                                                <p className="text-sm text-gray-500">Loading...</p>
                                            ) : assetPrices[asset.id] ? (
                                                <p className="text-sm font-mono text-accent-green">
                                                    ${assetPrices[asset.id].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-gray-500">--</p>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Collateral Asset */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-3">Collateral Asset</label>
                            <div className="space-y-3">
                                {collateralAssets.filter(a => a.id !== borrowAsset.id).map((asset) => (
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
                                        <div className="text-left flex-1">
                                            <p className="font-semibold text-white">{asset.symbol}</p>
                                            <p className="text-xs text-gray-400">{asset.name}</p>
                                        </div>
                                        <div className="text-right">
                                            {pricesLoading ? (
                                                <p className="text-sm text-gray-500">Loading...</p>
                                            ) : assetPrices[asset.id] ? (
                                                <p className="text-sm font-mono text-accent-green">
                                                    ${assetPrices[asset.id].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-gray-500">--</p>
                                            )}
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
                                    type="text"
                                    inputMode="decimal"
                                    value={borrowAmount}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                            setBorrowAmount(value);
                                        }
                                    }}
                                    placeholder="0.00"
                                    className="input-primary text-xl font-mono pr-16"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                                    {borrowAsset.symbol}
                                </span>
                            </div>
                            {borrowAmount && assetPrices[borrowAsset.id] && (
                                <p className="text-sm text-gray-500 mt-2">
                                    ≈ ${(parseFloat(borrowAmount) * assetPrices[borrowAsset.id]).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
                                </p>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-medium text-gray-400">Collateral Amount</label>
                                {recommendedCollateral && borrowAmount && (
                                    <button
                                        onClick={applyRecommendedCollateral}
                                        className="flex items-center space-x-1 px-2 py-1 bg-accent-purple/20 hover:bg-accent-purple/30 text-accent-purple text-xs rounded-lg transition-colors"
                                    >
                                        <FiZap className="w-3 h-3" />
                                        <span>AI Recommend</span>
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={collateralAmount}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                            setCollateralAmount(value);
                                        }
                                    }}
                                    placeholder="0.00"
                                    className={`input-primary text-xl font-mono pr-16 ${autoCalculating ? 'border-accent-purple animate-pulse' : ''}`}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                                    {collateralAsset.symbol}
                                </span>
                            </div>
                            {collateralAmount && assetPrices[collateralAsset.id] && (
                                <p className="text-sm text-gray-500 mt-2">
                                    ≈ ${(parseFloat(collateralAmount) * assetPrices[collateralAsset.id]).toLocaleString(undefined, { maximumFractionDigits: 2 })} USD
                                </p>
                            )}

                            {/* AI Recommendation Box */}
                            {recommendedCollateral && borrowAmount && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mt-3 p-3 bg-gradient-to-r from-accent-purple/10 to-primary-600/10 border border-accent-purple/30 rounded-xl"
                                >
                                    <div className="flex items-start space-x-2">
                                        <FiCpu className="w-4 h-4 text-accent-purple mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-xs font-medium text-accent-purple">Recommended</p>
                                            <p className="text-sm text-white mt-1">
                                                {recommendedCollateral.amount.toFixed(6)} {collateralAsset.symbol}
                                                <span className="text-gray-400 ml-2">
                                                    ({(recommendedCollateral.ratio * 100).toFixed(0)}% ratio)
                                                </span>
                                            </p>
                                            <div className="flex items-center space-x-3 mt-2 text-xs">
                                                <span className={`px-2 py-0.5 rounded ${recommendedCollateral.prediction.trend === 'bullish'
                                                    ? 'bg-accent-green/20 text-accent-green'
                                                    : recommendedCollateral.prediction.trend === 'bearish'
                                                        ? 'bg-accent-red/20 text-accent-red'
                                                        : 'bg-gray-600/20 text-gray-400'
                                                    }`}>
                                                    {recommendedCollateral.prediction.trend === 'bullish' ? '↑' : recommendedCollateral.prediction.trend === 'bearish' ? '↓' : '→'}
                                                    {' '}{Math.abs(recommendedCollateral.prediction.change).toFixed(2)}% predicted
                                                </span>
                                                <span className="text-gray-500">
                                                    {(recommendedCollateral.prediction.confidence * 100).toFixed(0)}% confidence
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    </div>

                    {/* USD Value Comparison */}
                    {borrowRate && borrowRate.borrow_value_usd > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-4 p-4 bg-dark-400 rounded-xl"
                        >
                            <h4 className="text-sm font-medium text-gray-400 mb-3">Value Comparison (USD)</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-gray-500">Borrow Value</p>
                                    <p className="text-lg font-semibold text-white">
                                        ${borrowRate.borrow_value_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        @ ${borrowRate.borrow_price_usd.toLocaleString()}/{borrowAsset.symbol}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500">Collateral Value</p>
                                    <p className={`text-lg font-semibold ${borrowRate.collateral_ratio >= 1.5 ? 'text-accent-green' :
                                        borrowRate.collateral_ratio >= 1.15 ? 'text-amber-400' : 'text-accent-red'
                                        }`}>
                                        ${borrowRate.collateral_value_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        @ ${borrowRate.collateral_price_usd.toLocaleString()}/{collateralAsset.symbol}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-gray-700">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-400">Collateral Ratio</span>
                                    <span className={`text-lg font-bold ${borrowRate.collateral_ratio >= 1.5 ? 'text-accent-green' :
                                        borrowRate.collateral_ratio >= 1.15 ? 'text-amber-400' : 'text-accent-red'
                                        }`}>
                                        {(borrowRate.collateral_ratio * 100).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </motion.div>
                    )}

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
