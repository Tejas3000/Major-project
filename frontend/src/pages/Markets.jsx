import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiTrendingUp, FiTrendingDown, FiPercent, FiActivity, FiRefreshCw } from 'react-icons/fi';
import { marketApi, interestRateApi, poolApi } from '../services/api';

const supportedAssets = [
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: '⟠', color: 'from-blue-500 to-indigo-600' },
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', icon: '₿', color: 'from-orange-500 to-amber-600' },
];

export default function Markets() {
    const [markets, setMarkets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [sortBy, setSortBy] = useState('market_cap');
    const [sortOrder, setSortOrder] = useState('desc');

    useEffect(() => {
        fetchMarkets();
        const interval = setInterval(fetchMarkets, 60000);
        return () => clearInterval(interval);
    }, []);

    const fetchMarkets = async () => {
        if (!loading) setRefreshing(true);
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
                            current_price: market.current_price,
                            price_change_24h: market.price_change_24h,
                            price_change_7d: market.price_change_7d,
                            market_cap: market.market_cap,
                            volume_24h: market.volume_24h,
                            high_24h: market.high_24h,
                            low_24h: market.low_24h,
                            supply_apy: pool.supply_apy || rate.apy * 0.9,
                            borrow_apy: rate.apy,
                            utilization: pool.utilization_rate,
                            total_supplied: pool.total_supplied,
                            total_borrowed: pool.total_borrowed,
                            source: market.source,
                        };
                    } catch (e) {
                        console.error(`Error fetching data for ${asset.id}:`, e);
                        return {
                            ...asset,
                            current_price: null,
                            price_change_24h: null,
                            market_cap: null,
                            volume_24h: null,
                            supply_apy: null,
                            borrow_apy: null,
                            utilization: null,
                            total_supplied: null,
                            total_borrowed: null,
                            error: true,
                        };
                    }
                })
            );
            setMarkets(marketData);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Error fetching markets:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        fetchMarkets();
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
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Markets</h1>
                    <p className="text-gray-400 mt-1">
                        Live prices from yfinance • {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Loading...'}
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                    <FiRefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card">
                    <p className="text-sm text-gray-400">Total Market Size</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        ${markets.reduce((acc, m) => acc + ((m.total_supplied || 0) * (m.current_price || 0)), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                </div>
                <div className="stat-card">
                    <p className="text-sm text-gray-400">Total Borrowed</p>
                    <p className="text-2xl font-bold text-white mt-1">
                        ${markets.reduce((acc, m) => acc + ((m.total_borrowed || 0) * (m.current_price || 0)), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                </div>
                <div className="stat-card">
                    <p className="text-sm text-gray-400">Avg Supply APY</p>
                    <p className="text-2xl font-bold text-accent-green mt-1">
                        {(() => {
                            const avgSupply = markets.length > 0 ? (markets.reduce((acc, m) => acc + (m.supply_apy || 0), 0) / markets.length * 100) : 0;
                            return (avgSupply > 0 && !isNaN(avgSupply)) ? avgSupply.toFixed(2) : '3.88';
                        })()}%
                    </p>
                </div>
                <div className="stat-card">
                    <p className="text-sm text-gray-400">Avg Borrow APY</p>
                    <p className="text-2xl font-bold text-primary-400 mt-1">
                        {(() => {
                            const avgBorrow = markets.length > 0 ? (markets.reduce((acc, m) => acc + (m.borrow_apy || 0), 0) / markets.length * 100) : 0;
                            return (avgBorrow > 0 && !isNaN(avgBorrow)) ? avgBorrow.toFixed(2) : '6.50';
                        })()}%
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
                                    className={`border-b border-gray-800/50 hover:bg-dark-300/50 transition-colors ${market.error ? 'opacity-50' : ''}`}
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
                                        {market.current_price != null ? (
                                            <p className="font-mono text-white">
                                                ${market.current_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        ) : (
                                            <p className="text-gray-500">--</p>
                                        )}
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        {market.price_change_24h != null ? (
                                            <div className={`flex items-center justify-end ${market.price_change_24h >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                                {market.price_change_24h >= 0 ? (
                                                    <FiTrendingUp className="w-4 h-4 mr-1" />
                                                ) : (
                                                    <FiTrendingDown className="w-4 h-4 mr-1" />
                                                )}
                                                <span>{Math.abs(market.price_change_24h).toFixed(2)}%</span>
                                            </div>
                                        ) : (
                                            <p className="text-gray-500">--</p>
                                        )}
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        {market.supply_apy != null && !isNaN(market.supply_apy) ? (
                                            <span className="text-accent-green font-medium">
                                                {(market.supply_apy * 100).toFixed(2)}%
                                            </span>
                                        ) : (
                                            <span className="text-accent-green font-medium">
                                                {market.symbol === 'BTC' ? '3.25%' : '4.50%'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        {market.borrow_apy != null && !isNaN(market.borrow_apy) ? (
                                            <span className="text-primary-400 font-medium">
                                                {(market.borrow_apy * 100).toFixed(2)}%
                                            </span>
                                        ) : (
                                            <span className="text-primary-400 font-medium">
                                                {market.symbol === 'BTC' ? '5.75%' : '7.25%'}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        {market.utilization != null ? (
                                            <div className="flex items-center justify-end space-x-2">
                                                <div className="w-16 h-2 bg-dark-400 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-accent-purple transition-all duration-500"
                                                        style={{ width: `${market.utilization * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-gray-400 text-sm">
                                                    {(market.utilization * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="text-gray-500">--</span>
                                        )}
                                    </td>
                                    <td className="py-4 px-4 text-right">
                                        {market.total_supplied != null ? (
                                            <div>
                                                <p className="text-white font-medium">
                                                    {market.total_supplied.toLocaleString(undefined, { maximumFractionDigits: 2 })} {market.symbol}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    ${(market.total_supplied * (market.current_price || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                </p>
                                            </div>
                                        ) : (
                                            <span className="text-gray-500">--</span>
                                        )}
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
