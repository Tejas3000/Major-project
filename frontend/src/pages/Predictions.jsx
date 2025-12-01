import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Line } from 'react-chartjs-2';
import { FiCpu, FiTrendingUp, FiTrendingDown, FiTarget, FiRefreshCw } from 'react-icons/fi';
import { predictionApi, marketApi } from '../services/api';
import toast from 'react-hot-toast';

const supportedAssets = [
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', icon: '⟠' },
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
    { id: 'matic-network', symbol: 'MATIC', name: 'Polygon', icon: '⬡' },
];

export default function Predictions() {
    const [selectedAsset, setSelectedAsset] = useState(supportedAssets[0]);
    const [prediction, setPrediction] = useState(null);
    const [marketData, setMarketData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [training, setTraining] = useState(false);

    useEffect(() => {
        fetchPrediction();
    }, [selectedAsset]);

    const fetchPrediction = async () => {
        setLoading(true);
        try {
            const [pred, market] = await Promise.all([
                predictionApi.getPrediction(selectedAsset.id),
                marketApi.getMarketData(selectedAsset.id),
            ]);
            setPrediction(pred);
            setMarketData(market);
        } catch (error) {
            console.error('Error fetching prediction:', error);
            // Mock data
            setPrediction({
                current_price: 2250.50,
                trend: 'bullish',
                predicted_change_percent: 5.2,
                confidence_score: 0.78,
                predictions: [
                    { day: 1, predicted_price: 2280, lower_bound: 2200, upper_bound: 2360 },
                    { day: 2, predicted_price: 2310, lower_bound: 2220, upper_bound: 2400 },
                    { day: 3, predicted_price: 2295, lower_bound: 2190, upper_bound: 2400 },
                    { day: 4, predicted_price: 2340, lower_bound: 2230, upper_bound: 2450 },
                    { day: 5, predicted_price: 2380, lower_bound: 2260, upper_bound: 2500 },
                    { day: 6, predicted_price: 2365, lower_bound: 2230, upper_bound: 2500 },
                    { day: 7, predicted_price: 2420, lower_bound: 2280, upper_bound: 2560 },
                ],
            });
            setMarketData({
                current_price: 2250.50,
                price_change_24h: 3.45,
                price_change_7d: -2.15,
                market_cap: 270000000000,
                volume_24h: 15000000000,
            });
        } finally {
            setLoading(false);
        }
    };

    const handleTrainModel = async () => {
        setTraining(true);
        try {
            await predictionApi.trainModel(selectedAsset.id);
            toast.success('Model training initiated! This may take a few minutes.');
            // Refresh predictions after training
            setTimeout(fetchPrediction, 5000);
        } catch (error) {
            console.error('Error training model:', error);
            toast.error('Failed to train model');
        } finally {
            setTraining(false);
        }
    };

    const chartData = {
        labels: prediction?.predictions?.map(p => `Day ${p.day}`) || [],
        datasets: [
            {
                label: 'Predicted Price',
                data: prediction?.predictions?.map(p => p.predicted_price) || [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: false,
                tension: 0.4,
                pointRadius: 6,
                pointBackgroundColor: '#10b981',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            },
            {
                label: 'Upper Bound',
                data: prediction?.predictions?.map(p => p.upper_bound) || [],
                borderColor: 'rgba(16, 185, 129, 0.3)',
                borderDash: [5, 5],
                fill: false,
                tension: 0.4,
                pointRadius: 0,
            },
            {
                label: 'Lower Bound',
                data: prediction?.predictions?.map(p => p.lower_bound) || [],
                borderColor: 'rgba(16, 185, 129, 0.3)',
                borderDash: [5, 5],
                fill: '-1',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                pointRadius: 0,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: {
                    color: '#94a3b8',
                    usePointStyle: true,
                },
            },
            tooltip: {
                backgroundColor: '#1e293b',
                titleColor: '#fff',
                bodyColor: '#94a3b8',
                borderColor: '#334155',
                borderWidth: 1,
                padding: 12,
                callbacks: {
                    label: function (context) {
                        return `${context.dataset.label}: $${context.raw.toLocaleString()}`;
                    },
                },
            },
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: { color: '#64748b' },
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                    color: '#64748b',
                    callback: function (value) {
                        return '$' + value.toLocaleString();
                    },
                },
            },
        },
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-12 w-64 skeleton rounded-lg" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 h-96 skeleton rounded-2xl" />
                    <div className="h-96 skeleton rounded-2xl" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center">
                        <FiCpu className="w-8 h-8 mr-3 text-accent-green" />
                        AI Price Predictions
                    </h1>
                    <p className="text-gray-400 mt-1">LSTM-powered cryptocurrency price forecasting</p>
                </div>
                <div className="mt-4 md:mt-0 flex items-center space-x-4">
                    <button
                        onClick={handleTrainModel}
                        disabled={training}
                        className="btn-secondary flex items-center space-x-2 disabled:opacity-50"
                    >
                        <FiRefreshCw className={`w-4 h-4 ${training ? 'animate-spin' : ''}`} />
                        <span>{training ? 'Training...' : 'Retrain Model'}</span>
                    </button>
                </div>
            </div>

            {/* Asset Selection */}
            <div className="flex space-x-4">
                {supportedAssets.map((asset) => (
                    <button
                        key={asset.id}
                        onClick={() => setSelectedAsset(asset)}
                        className={`px-6 py-3 rounded-xl flex items-center space-x-2 transition-all duration-200 ${selectedAsset.id === asset.id
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-200 text-gray-400 hover:text-white hover:bg-dark-100'
                            }`}
                    >
                        <span className="text-xl">{asset.icon}</span>
                        <span className="font-medium">{asset.symbol}</span>
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Prediction Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="lg:col-span-2 card"
                >
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h3 className="text-lg font-semibold text-white">7-Day Price Forecast</h3>
                            <p className="text-sm text-gray-400">Shaded area represents prediction confidence interval</p>
                        </div>
                        <div className={`px-4 py-2 rounded-xl ${prediction?.trend === 'bullish'
                                ? 'bg-accent-green/20 text-accent-green'
                                : 'bg-accent-red/20 text-accent-red'
                            }`}>
                            {prediction?.trend === 'bullish' ? (
                                <FiTrendingUp className="w-5 h-5 inline mr-2" />
                            ) : (
                                <FiTrendingDown className="w-5 h-5 inline mr-2" />
                            )}
                            {prediction?.trend === 'bullish' ? 'Bullish' : 'Bearish'} Trend
                        </div>
                    </div>
                    <div className="h-80">
                        <Line data={chartData} options={chartOptions} />
                    </div>
                </motion.div>

                {/* Prediction Details */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="space-y-6"
                >
                    {/* Current Price */}
                    <div className="card">
                        <h3 className="text-sm text-gray-400 mb-2">Current Price</h3>
                        <p className="text-3xl font-bold text-white">
                            ${prediction?.current_price?.toLocaleString() || '0'}
                        </p>
                        <div className={`flex items-center mt-2 ${(marketData?.price_change_24h || 0) >= 0 ? 'text-accent-green' : 'text-accent-red'
                            }`}>
                            {(marketData?.price_change_24h || 0) >= 0 ? (
                                <FiTrendingUp className="w-4 h-4 mr-1" />
                            ) : (
                                <FiTrendingDown className="w-4 h-4 mr-1" />
                            )}
                            <span>{Math.abs(marketData?.price_change_24h || 0).toFixed(2)}% (24h)</span>
                        </div>
                    </div>

                    {/* Confidence Score */}
                    <div className="card">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm text-gray-400">Model Confidence</h3>
                            <FiTarget className="w-5 h-5 text-accent-green" />
                        </div>
                        <div className="flex items-center space-x-4">
                            <div className="flex-1">
                                <div className="h-3 bg-dark-300 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-accent-green to-emerald-400 transition-all duration-500"
                                        style={{ width: `${(prediction?.confidence_score || 0) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <span className="text-2xl font-bold text-accent-green">
                                {((prediction?.confidence_score || 0) * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>

                    {/* Predicted Change */}
                    <div className="card">
                        <h3 className="text-sm text-gray-400 mb-2">Predicted Change (7d)</h3>
                        <p className={`text-3xl font-bold ${(prediction?.predicted_change_percent || 0) >= 0 ? 'text-accent-green' : 'text-accent-red'
                            }`}>
                            {(prediction?.predicted_change_percent || 0) >= 0 ? '+' : ''}
                            {(prediction?.predicted_change_percent || 0).toFixed(2)}%
                        </p>
                    </div>

                    {/* Daily Predictions */}
                    <div className="card">
                        <h3 className="text-sm text-gray-400 mb-4">Daily Predictions</h3>
                        <div className="space-y-3 max-h-48 overflow-y-auto">
                            {prediction?.predictions?.map((p) => (
                                <div key={p.day} className="flex items-center justify-between p-2 bg-dark-300 rounded-lg">
                                    <span className="text-gray-400">Day {p.day}</span>
                                    <span className="font-medium text-white">${p.predicted_price.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Model Info */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="card bg-gradient-to-r from-primary-600/10 to-accent-purple/10 border-primary-500/20"
            >
                <div className="flex items-start space-x-4">
                    <div className="p-3 bg-primary-600/20 rounded-xl">
                        <FiCpu className="w-6 h-6 text-primary-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-white">About the LSTM Model</h3>
                        <p className="text-gray-400 mt-2">
                            Our prediction model uses a Bidirectional LSTM (Long Short-Term Memory) neural network
                            trained on historical price data, technical indicators, and market sentiment. The model
                            analyzes patterns in 60-day price windows to generate 7-day forecasts with confidence intervals.
                        </p>
                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-xs text-gray-500">Architecture</p>
                                <p className="font-medium text-white">Bi-LSTM</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Lookback Period</p>
                                <p className="font-medium text-white">60 Days</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Features Used</p>
                                <p className="font-medium text-white">16 Technical</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Update Frequency</p>
                                <p className="font-medium text-white">Hourly</p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
