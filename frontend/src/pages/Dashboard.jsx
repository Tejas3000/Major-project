import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Line, Doughnut } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ArcElement,
} from 'chart.js';
import {
    FiTrendingUp, FiTrendingDown, FiDollarSign,
    FiPercent, FiActivity, FiShield, FiCpu
} from 'react-icons/fi';
import { useWallet } from '../context/WalletContext';
import { marketApi, interestRateApi, predictionApi, poolApi } from '../services/api';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ArcElement
);

const StatCard = ({ title, value, change, icon: Icon, color, subtitle }) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="stat-card card-hover"
    >
        <div className="flex items-start justify-between">
            <div>
                <p className="text-sm text-gray-400">{title}</p>
                <p className="text-2xl font-bold text-white mt-1">{value}</p>
                {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
                {change !== undefined && (
                    <div className={`flex items-center mt-2 text-sm ${change >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {change >= 0 ? <FiTrendingUp className="w-4 h-4 mr-1" /> : <FiTrendingDown className="w-4 h-4 mr-1" />}
                        <span>{Math.abs(change).toFixed(2)}%</span>
                    </div>
                )}
            </div>
            <div className={`p-3 rounded-xl ${color}`}>
                <Icon className="w-6 h-6 text-white" />
            </div>
        </div>
    </motion.div>
);

export default function Dashboard() {
    const { isConnected, account } = useWallet();
    const [loading, setLoading] = useState(true);
    const [marketData, setMarketData] = useState(null);
    const [interestRate, setInterestRate] = useState(null);
    const [prediction, setPrediction] = useState(null);
    const [poolStats, setPoolStats] = useState(null);
    const [priceHistory, setPriceHistory] = useState([]);

    useEffect(() => {
        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const [market, rate, pred, pool, history] = await Promise.all([
                marketApi.getMarketData('ethereum'),
                interestRateApi.getInterestRate('ethereum'),
                predictionApi.getPrediction('ethereum'),
                poolApi.getPoolStats('ethereum'),
                marketApi.getPriceHistory('ethereum', 30),
            ]);

            setMarketData(market);
            setInterestRate(rate);
            setPrediction(pred);
            setPoolStats(pool);
            setPriceHistory(history.history || []);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            // Use mock data for demo
            setMarketData({
                current_price: 2250.50,
                price_change_24h: 3.45,
                price_change_7d: -2.15,
                market_cap: 270000000000,
                volume_24h: 15000000000,
            });
            setInterestRate({
                effective_rate: 0.068,
                base_rate: 0.02,
                volatility_premium: 0.025,
                utilization_factor: 0.018,
                risk_adjustment: 0.005,
                apy: 0.0703,
            });
            setPrediction({
                trend: 'bullish',
                predicted_change_percent: 5.2,
                confidence_score: 0.78,
                predictions: [
                    { day: 1, predicted_price: 2280 },
                    { day: 2, predicted_price: 2310 },
                    { day: 3, predicted_price: 2295 },
                    { day: 4, predicted_price: 2340 },
                    { day: 5, predicted_price: 2380 },
                    { day: 6, predicted_price: 2365 },
                    { day: 7, predicted_price: 2420 },
                ],
            });
            setPoolStats({
                total_supplied: 15000,
                total_borrowed: 9750,
                utilization_rate: 0.65,
                available_liquidity: 5250,
            });
            // Generate mock price history
            const mockHistory = [];
            let price = 2100;
            for (let i = 30; i >= 0; i--) {
                price += (Math.random() - 0.48) * 50;
                mockHistory.push({
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    price: price,
                });
            }
            setPriceHistory(mockHistory);
        } finally {
            setLoading(false);
        }
    };

    const priceChartData = {
        labels: priceHistory.map(p => p.date?.split('-').slice(1).join('/')),
        datasets: [
            {
                label: 'ETH Price',
                data: priceHistory.map(p => p.price),
                borderColor: '#0ea5e9',
                backgroundColor: 'rgba(14, 165, 233, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#0ea5e9',
            },
        ],
    };

    const predictionChartData = {
        labels: prediction?.predictions?.map(p => `Day ${p.day}`) || [],
        datasets: [
            {
                label: 'Predicted Price',
                data: prediction?.predictions?.map(p => p.predicted_price) || [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#10b981',
            },
        ],
    };

    const poolChartData = {
        labels: ['Borrowed', 'Available'],
        datasets: [
            {
                data: [poolStats?.total_borrowed || 0, poolStats?.available_liquidity || 0],
                backgroundColor: ['#8b5cf6', '#10b981'],
                borderWidth: 0,
                hoverOffset: 4,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1e293b',
                titleColor: '#fff',
                bodyColor: '#94a3b8',
                borderColor: '#334155',
                borderWidth: 1,
                padding: 12,
                displayColors: false,
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' },
            },
        },
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="stat-card">
                            <div className="h-20 skeleton rounded-lg" />
                        </div>
                    ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="card h-80 skeleton" />
                    <div className="card h-80 skeleton" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                    <p className="text-gray-400 mt-1">ML-Powered DeFi Lending Platform</p>
                </div>
                {isConnected && (
                    <div className="mt-4 md:mt-0 px-4 py-2 bg-accent-green/10 border border-accent-green/20 rounded-xl">
                        <span className="text-accent-green text-sm font-medium">
                            ● Connected to {account?.slice(0, 6)}...{account?.slice(-4)}
                        </span>
                    </div>
                )}
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="ETH Price"
                    value={`$${marketData?.current_price?.toLocaleString() || '0'}`}
                    change={marketData?.price_change_24h}
                    icon={FiDollarSign}
                    color="bg-gradient-to-br from-primary-500 to-primary-600"
                />
                <StatCard
                    title="Current APY"
                    value={`${((interestRate?.apy || 0) * 100).toFixed(2)}%`}
                    subtitle="ML-Optimized Rate"
                    icon={FiPercent}
                    color="bg-gradient-to-br from-accent-purple to-purple-600"
                />
                <StatCard
                    title="Pool Utilization"
                    value={`${((poolStats?.utilization_rate || 0) * 100).toFixed(1)}%`}
                    subtitle={`${poolStats?.total_borrowed?.toLocaleString() || 0} ETH Borrowed`}
                    icon={FiActivity}
                    color="bg-gradient-to-br from-accent-green to-emerald-600"
                />
                <StatCard
                    title="AI Confidence"
                    value={`${((prediction?.confidence_score || 0) * 100).toFixed(0)}%`}
                    subtitle={`${prediction?.trend || 'Neutral'} Trend`}
                    icon={FiCpu}
                    color="bg-gradient-to-br from-amber-500 to-orange-600"
                />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Price Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="card"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white">Price History</h3>
                            <p className="text-sm text-gray-400">Last 30 days</p>
                        </div>
                        <div className="px-3 py-1 bg-primary-600/20 text-primary-400 rounded-lg text-sm">
                            ETH/USD
                        </div>
                    </div>
                    <div className="h-64">
                        <Line data={priceChartData} options={chartOptions} />
                    </div>
                </motion.div>

                {/* Prediction Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="card"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white">AI Price Prediction</h3>
                            <p className="text-sm text-gray-400">Next 7 days forecast</p>
                        </div>
                        <div className={`px-3 py-1 rounded-lg text-sm ${prediction?.trend === 'bullish'
                                ? 'bg-accent-green/20 text-accent-green'
                                : 'bg-accent-red/20 text-accent-red'
                            }`}>
                            {prediction?.trend === 'bullish' ? '↑' : '↓'} {Math.abs(prediction?.predicted_change_percent || 0).toFixed(1)}%
                        </div>
                    </div>
                    <div className="h-64">
                        <Line data={predictionChartData} options={chartOptions} />
                    </div>
                </motion.div>
            </div>

            {/* Bottom Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Pool Distribution */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="card"
                >
                    <h3 className="text-lg font-semibold text-white mb-6">Pool Distribution</h3>
                    <div className="h-48 flex items-center justify-center">
                        <Doughnut
                            data={poolChartData}
                            options={{
                                responsive: true,
                                maintainAspectRatio: false,
                                cutout: '70%',
                                plugins: {
                                    legend: { display: false },
                                },
                            }}
                        />
                    </div>
                    <div className="mt-6 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <div className="w-3 h-3 rounded-full bg-accent-purple mr-2" />
                                <span className="text-gray-400 text-sm">Total Borrowed</span>
                            </div>
                            <span className="text-white font-medium">{poolStats?.total_borrowed?.toLocaleString()} ETH</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <div className="w-3 h-3 rounded-full bg-accent-green mr-2" />
                                <span className="text-gray-400 text-sm">Available</span>
                            </div>
                            <span className="text-white font-medium">{poolStats?.available_liquidity?.toLocaleString()} ETH</span>
                        </div>
                    </div>
                </motion.div>

                {/* Interest Rate Breakdown */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="card col-span-1 lg:col-span-2"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-white">Interest Rate Components</h3>
                        <div className="flex items-center text-accent-green">
                            <FiCpu className="w-4 h-4 mr-2" />
                            <span className="text-sm">ML-Powered</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-dark-300 rounded-xl">
                            <p className="text-xs text-gray-400 mb-1">Base Rate</p>
                            <p className="text-xl font-bold text-white">
                                {((interestRate?.base_rate || 0) * 100).toFixed(1)}%
                            </p>
                        </div>
                        <div className="p-4 bg-dark-300 rounded-xl">
                            <p className="text-xs text-gray-400 mb-1">Volatility Premium</p>
                            <p className="text-xl font-bold text-amber-400">
                                +{((interestRate?.volatility_premium || 0) * 100).toFixed(2)}%
                            </p>
                        </div>
                        <div className="p-4 bg-dark-300 rounded-xl">
                            <p className="text-xs text-gray-400 mb-1">Utilization Factor</p>
                            <p className="text-xl font-bold text-primary-400">
                                +{((interestRate?.utilization_factor || 0) * 100).toFixed(2)}%
                            </p>
                        </div>
                        <div className="p-4 bg-dark-300 rounded-xl">
                            <p className="text-xs text-gray-400 mb-1">Risk Adjustment</p>
                            <p className="text-xl font-bold text-accent-purple">
                                +{((interestRate?.risk_adjustment || 0) * 100).toFixed(2)}%
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 p-4 bg-gradient-to-r from-primary-600/20 to-accent-purple/20 rounded-xl border border-primary-500/20">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-400">Effective Borrow Rate</p>
                                <p className="text-3xl font-bold text-white mt-1">
                                    {((interestRate?.effective_rate || 0) * 100).toFixed(2)}%
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-gray-400">Annual Percentage Yield</p>
                                <p className="text-3xl font-bold text-accent-green mt-1">
                                    {((interestRate?.apy || 0) * 100).toFixed(2)}%
                                </p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
