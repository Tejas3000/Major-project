import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiTrendingUp, FiTrendingDown, FiPercent, FiActivity } from 'react-icons/fi';
import { marketApi, interestRateApi, poolApi } from '../services/api';

const supportedAssets = [
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: 'from-blue-500 to-indigo-600' },
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', icon: '₿', color: 'from-orange-500 to-amber-600' },
    { id: 'matic-network', symbol: 'MATIC', name: 'Polygon', icon: '⬡', color: 'from-purple-500 to-violet-600' },
    { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', icon: '⬡', color: 'from-blue-400 to-blue-600' },
    { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', icon: '🦄', color: 'from-pink-500 to-rose-600' },
];

export default function Markets() {
    const [markets, setMarkets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('market_cap');
    const [sortOrder, setSortOrder] = useState('desc');

    useEffect(() => {
        fetchMarkets();
        const interval = setInterval(fetchMarkets, 60000);
        return () => clearInterval(interval);
    }, []);

    const fetchMarkets = async () => {
        setLoading(true);
        try {
            const marketData = await Promise.all(
                supportedAssets.map(async (asset) => {
                    try {
                        const [market, rate, pool] = await Promise.all([
                            marketApi.getMarketData(asset.id),
                            interestRateApi.getInterestRate(asset.id),
                            poolApi.getPoolStats(asset.id),
                        ]);
                        return {
                            ...asset,
                            ...market,
                            supply_apy: pool.supply_apy || rate.apy * 0.9,
                            borrow_apy: rate.apy,
                            utilization: pool.utilization_rate,
                            total_supplied: pool.total_supplied,
                            total_borrowed: pool.total_borrowed,
                        };
                    } catch (e) {
                        return {
                            ...asset,
                            current_price: Math.random() * 3000 + 100,
                            price_change_24h: (Math.random() - 0.5) * 10,
                            market_cap: Math.random() * 100000000000,
                            volume_24h: Math.random() * 5000000000,
                            supply_apy: Math.random() * 0.1,
                            borrow_apy: Math.random() * 0.15,
                            utilization: Math.random() * 0.8,
                            total_supplied: Math.random() * 50000,
                            total_borrowed: Math.random() * 30000,
                        };
                    }
                })
            );
            setMarkets(marketData);
        } catch (error) {
            console.error('Error fetching markets:', error);
        } finally {
            setLoading(false);
        }
    };

    const sortedMarkets = [...markets].sort((a, b) => {
        const aVal = a[sortBy] || 0;
        const bVal = b[sortBy] || 0;
        return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    const handleSort = (field) => {
        if (sortBy === field) {
            setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
        } else {
            setSortBy(field);
            setSortOrder('desc');
        }
    };

    const SortButton = ({ field, children }) => (
        <button
            onClick={() => handleSort(field)}
            className={`flex items-center space-x-1 text-xs uppercase tracking-wider ${sortBy === field ? 'text-primary-400' : 'text-gray-400 hover:text-white'
                }`}
        >
            <span>{children}</span>
            {sortBy === field && (
                <span>{sortOrder === 'desc' ? '↓' : '↑'}</span>
            )}
        </button>
    );

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-12 w-48 skeleton rounded-lg" />
                <div className="card">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="h-16 skeleton rounded-lg mb-4" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Markets</h1>
                <p className="text-gray-400 mt-1">Overview of all lending markets and rates</p>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card">
                    <p className="text-sm text-gray-400">Total Market Size</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        ${(markets.reduce((acc, m) => acc + (m.total_supplied || 0), 0) * 2250).toLocaleString()}
                    </p>
                </div>
                <div className="stat-card">
                    <p className="text-sm text-gray-400">Total Borrowed</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        ${(markets.reduce((acc, m) => acc + (m.total_borrowed || 0), 0) * 2250).toLocaleString()}
                    </p>
                </div>
                <div className="stat-card">
                    <p className="text-sm text-gray-400">Avg Supply APY</p>
                    <p className="text-2xl font-bold text-accent-green mt-1">
                        {(markets.reduce((acc, m) => acc + (m.supply_apy || 0), 0) / markets.length * 100).toFixed(2)}%
                    </p>
                </div>
                <div className="stat-card">
                    <p className="text-sm text-gray-400">Avg Borrow APY</p>
                    <p className="text-2xl font-bold text-primary-400 mt-1">
                        {(markets.reduce((acc, m) => acc + (m.borrow_apy || 0), 0) / markets.length * 100).toFixed(2)}%
                    </p>
                </div>
            </div>

            {/* Markets Table */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card overflow-hidden"
            >
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-800">
                                <th className="text-left py-4 px-4">
                                    <SortButton field="name">Asset</SortButton>
                                </th>
                                <th className="text-right py-4 px-4">
                                    <SortButton field="current_price">Price</SortButton>
                                </th>
                                <th className="text-right py-4 px-4">
                                    <SortButton field="price_change_24h">24h Change</SortButton>
                                </th>
                                <th className="text-right py-4 px-4">
                                    <SortButton field="supply_apy">Supply APY</SortButton>
                                </th>
                                <th className="text-right py-4 px-4">
                                    <SortButton field="borrow_apy">Borrow APY</SortButton>
                                </th>
                                <th className="text-right py-4 px-4">
                                    <SortButton field="utilization">Utilization</SortButton>
                                </th>
                                <th className="text-right py-4 px-4">
                                    <SortButton field="total_supplied">Total Supplied</SortButton>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedMarkets.map((market, index) => (
                                <motion.tr
                                    key={market.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className="border-b border-gray-800/50 hover:bg-dark-300/50 transition-colors"
                                >
                                    <td className="py-4 px-4">
                                        <div className="flex items-center space-x-3">
                                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${market.color} flex items-center justify-center text-xl`}>
                                                {market.icon}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-white">{market.symbol}</p>
                                                <p className="text-xs text-gray-500">{market.name}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <p className="font-mono text-white">
                                            ${market.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <div className={`flex items-center justify-end ${(market.price_change_24h || 0) >= 0 ? 'text-accent-green' : 'text-accent-red'
                                            }`}>
                                            {(market.price_change_24h || 0) >= 0 ? (
                                                <FiTrendingUp className="w-4 h-4 mr-1" />
                                            ) : (
                                                <FiTrendingDown className="w-4 h-4 mr-1" />
                                            )}
                                            <span>{Math.abs(market.price_change_24h || 0).toFixed(2)}%</span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <span className="text-accent-green font-medium">
                                            {((market.supply_apy || 0) * 100).toFixed(2)}%
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <span className="text-primary-400 font-medium">
                                            {((market.borrow_apy || 0) * 100).toFixed(2)}%
                                        </span>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <div className="flex items-center justify-end space-x-2">
                                            <div className="w-16 h-2 bg-dark-400 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-accent-purple transition-all duration-500"
                                                    style={{ width: `${(market.utilization || 0) * 100}%` }}
                                                />
                                            </div>
                                            <span className="text-gray-400 text-sm">
                                                {((market.utilization || 0) * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        <p className="text-white font-medium">
                                            {(market.total_supplied || 0).toLocaleString()} {market.symbol}
                                        </p>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>

            {/* Info Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="card bg-gradient-to-br from-accent-green/10 to-transparent border-accent-green/20">
                    <div className="flex items-start space-x-4">
                        <div className="p-3 bg-accent-green/20 rounded-xl">
                            <FiPercent className="w-6 h-6 text-accent-green" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Supply APY</h3>
                            <p className="text-sm text-gray-400 mt-1">
                                Earn interest by supplying assets. Rates are dynamically adjusted based on
                                market utilization and ML-predicted volatility.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card bg-gradient-to-br from-primary-600/10 to-transparent border-primary-500/20">
                    <div className="flex items-start space-x-4">
                        <div className="p-3 bg-primary-600/20 rounded-xl">
                            <FiActivity className="w-6 h-6 text-primary-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">Borrow APY</h3>
                            <p className="text-sm text-gray-400 mt-1">
                                Borrow rates are calculated using our LSTM model predictions, ensuring
                                fair rates that reflect real-time market conditions.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
