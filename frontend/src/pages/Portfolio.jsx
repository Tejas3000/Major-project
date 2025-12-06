import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiPieChart, FiTrendingUp, FiTrendingDown, FiDollarSign, FiShield, FiRefreshCw } from 'react-icons/fi';
import { useWallet } from '../context/WalletContext';
import { userApi, interestRateApi } from '../services/api';

export default function Portfolio() {
    const { isConnected, account } = useWallet();
    const [positions, setPositions] = useState(null);
    const [healthFactor, setHealthFactor] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isConnected && account) {
            fetchPortfolio();
        } else {
            setLoading(false);
        }
    }, [isConnected, account]);

    const fetchPortfolio = async () => {
        setLoading(true);
        try {
            const [pos, health] = await Promise.all([
                userApi.getPositions(account),
                userApi.getHealthFactor(account),
            ]);
            setPositions(pos);
            setHealthFactor(health);
        } catch (error) {
            console.error('Error fetching portfolio:', error);
            // Mock data
            setPositions({
                supplied: [
                    { asset: 'ethereum', amount: 5.0, value_usd: 11250.0, apy: 0.045 },
                    { asset: 'bitcoin', amount: 0.5, value_usd: 21750.0, apy: 0.032 },
                ],
                borrowed: [
                    { asset: 'ethereum', amount: 2.0, value_usd: 4500.0, rate: 0.068 },
                ],
                total_supplied_usd: 33000.0,
                total_borrowed_usd: 4500.0,
                net_worth: 28500.0,
            });
            setHealthFactor({
                health_factor: 2.45,
                status: 'healthy',
                total_collateral_usd: 33000.0,
                total_debt_usd: 4500.0,
            });
        } finally {
            setLoading(false);
        }
    };

    const getHealthStatus = (hf) => {
        if (!hf) return { color: 'gray', label: 'N/A' };
        if (hf >= 2) return { color: 'green', label: 'Healthy' };
        if (hf >= 1.5) return { color: 'yellow', label: 'Moderate' };
        if (hf >= 1.1) return { color: 'orange', label: 'At Risk' };
        return { color: 'red', label: 'Danger' };
    };

    const getAssetIcon = (asset) => {
        const icons = {
            ethereum: '⟠',
            bitcoin: '₿',
            chainlink: '⬡',
            uniswap: '🦄',
        };
        return icons[asset] || '○';
    };

    if (!isConnected) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 bg-dark-200 rounded-full flex items-center justify-center mb-6">
                    <FiPieChart className="w-10 h-10 text-gray-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Connect Your Wallet</h2>
                <p className="text-gray-400 text-center max-w-md">
                    Connect your wallet to view your portfolio, including your supplied assets,
                    borrowed positions, and overall health factor.
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-12 w-48 skeleton rounded-lg" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-32 skeleton rounded-2xl" />
                    ))}
                </div>
                <div className="h-64 skeleton rounded-2xl" />
            </div>
        );
    }

    const status = getHealthStatus(healthFactor?.health_factor);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Portfolio</h1>
                    <p className="text-gray-400 mt-1">Your lending and borrowing positions</p>
                </div>
                <button
                    onClick={fetchPortfolio}
                    className="btn-secondary flex items-center space-x-2"
                >
                    <FiRefreshCw className="w-4 h-4" />
                    <span>Refresh</span>
                </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="stat-card"
                >
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-400">Net Worth</p>
                        <FiDollarSign className="w-5 h-5 text-primary-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">
                        ${positions?.net_worth?.toLocaleString() || '0'}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="stat-card"
                >
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-400">Total Supplied</p>
                        <FiTrendingUp className="w-5 h-5 text-accent-green" />
                    </div>
                    <p className="text-2xl font-bold text-accent-green">
                        ${positions?.total_supplied_usd?.toLocaleString() || '0'}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="stat-card"
                >
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-400">Total Borrowed</p>
                        <FiTrendingDown className="w-5 h-5 text-accent-red" />
                    </div>
                    <p className="text-2xl font-bold text-accent-red">
                        ${positions?.total_borrowed_usd?.toLocaleString() || '0'}
                    </p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="stat-card"
                >
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-400">Health Factor</p>
                        <FiShield className={`w-5 h-5 text-${status.color === 'green' ? 'accent-green' : status.color === 'red' ? 'accent-red' : 'amber-400'}`} />
                    </div>
                    <div className="flex items-center space-x-2">
                        <p className={`text-2xl font-bold ${status.color === 'green' ? 'text-accent-green' :
                            status.color === 'red' ? 'text-accent-red' : 'text-amber-400'
                            }`}>
                            {healthFactor?.health_factor?.toFixed(2) || '∞'}
                        </p>
                        <span className={`px-2 py-1 text-xs rounded-lg ${status.color === 'green' ? 'bg-accent-green/20 text-accent-green' :
                            status.color === 'red' ? 'bg-accent-red/20 text-accent-red' : 'bg-amber-400/20 text-amber-400'
                            }`}>
                            {status.label}
                        </span>
                    </div>
                </motion.div>
            </div>

            {/* Positions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Supplied Assets */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="card"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-white">Supplied Assets</h3>
                        <span className="text-accent-green text-sm font-medium">Earning Interest</span>
                    </div>

                    {positions?.supplied?.length > 0 ? (
                        <div className="space-y-4">
                            {positions.supplied.map((position, index) => (
                                <div
                                    key={index}
                                    className="p-4 bg-dark-300 rounded-xl flex items-center justify-between"
                                >
                                    <div className="flex items-center space-x-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-xl">
                                            {getAssetIcon(position.asset)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white capitalize">{position.asset}</p>
                                            <p className="text-sm text-gray-400">{position.amount} tokens</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-white">${position.value_usd.toLocaleString()}</p>
                                        <p className="text-sm text-accent-green">+{(position.apy * 100).toFixed(2)}% APY</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            No supplied assets yet
                        </div>
                    )}
                </motion.div>

                {/* Borrowed Assets */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="card"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-white">Borrowed Assets</h3>
                        <span className="text-accent-red text-sm font-medium">Accruing Interest</span>
                    </div>

                    {positions?.borrowed?.length > 0 ? (
                        <div className="space-y-4">
                            {positions.borrowed.map((position, index) => (
                                <div
                                    key={index}
                                    className="p-4 bg-dark-300 rounded-xl flex items-center justify-between"
                                >
                                    <div className="flex items-center space-x-4">
                                        <div className="w-10 h-10 bg-gradient-to-br from-accent-red to-rose-600 rounded-full flex items-center justify-center text-xl">
                                            {getAssetIcon(position.asset)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-white capitalize">{position.asset}</p>
                                            <p className="text-sm text-gray-400">{position.amount} tokens</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-semibold text-white">${position.value_usd.toLocaleString()}</p>
                                        <p className="text-sm text-accent-red">{(position.rate * 100).toFixed(2)}% Rate</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-gray-500">
                            No active borrows
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Health Factor Details */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="card"
            >
                <h3 className="text-lg font-semibold text-white mb-6">Health Factor Analysis</h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-4 bg-dark-300 rounded-xl">
                        <p className="text-sm text-gray-400 mb-2">Total Collateral</p>
                        <p className="text-xl font-bold text-white">
                            ${healthFactor?.total_collateral_usd?.toLocaleString() || '0'}
                        </p>
                    </div>
                    <div className="p-4 bg-dark-300 rounded-xl">
                        <p className="text-sm text-gray-400 mb-2">Total Debt</p>
                        <p className="text-xl font-bold text-white">
                            ${healthFactor?.total_debt_usd?.toLocaleString() || '0'}
                        </p>
                    </div>
                    <div className="p-4 bg-dark-300 rounded-xl">
                        <p className="text-sm text-gray-400 mb-2">Liquidation Threshold</p>
                        <p className="text-xl font-bold text-white">85%</p>
                    </div>
                </div>

                <div className="mt-6">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">Health Factor Progress</span>
                        <span className={`font-medium ${status.color === 'green' ? 'text-accent-green' :
                            status.color === 'red' ? 'text-accent-red' : 'text-amber-400'
                            }`}>
                            {healthFactor?.health_factor?.toFixed(2) || '∞'}
                        </span>
                    </div>
                    <div className="h-4 bg-dark-300 rounded-full overflow-hidden">
                        <div
                            className={`h-full transition-all duration-500 ${status.color === 'green' ? 'bg-accent-green' :
                                status.color === 'red' ? 'bg-accent-red' : 'bg-amber-400'
                                }`}
                            style={{ width: `${Math.min(100, ((healthFactor?.health_factor || 0) / 3) * 100)}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-gray-500">
                        <span>Liquidation (1.0)</span>
                        <span>Safe Zone ({">"} 1.5)</span>
                        <span>Healthy ({">"} 2.0)</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
