import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useWallet } from '../context/WalletContext';
import {
    FiHome, FiTrendingUp, FiDollarSign, FiPieChart,
    FiBarChart2, FiCpu, FiMenu, FiX
} from 'react-icons/fi';

const navItems = [
    { path: '/', label: 'Dashboard', icon: FiHome },
    { path: '/lend', label: 'Lend', icon: FiTrendingUp },
    { path: '/borrow', label: 'Borrow', icon: FiDollarSign },
    { path: '/portfolio', label: 'Portfolio', icon: FiPieChart },
    { path: '/markets', label: 'Markets', icon: FiBarChart2 },
    { path: '/predictions', label: 'AI Predictions', icon: FiCpu },
];

export default function Layout({ children }) {
    const location = useLocation();
    const { account, balance, isConnecting, connectWallet, disconnectWallet, isConnected } = useWallet();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const formatAddress = (address) => {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    return (
        <div className="min-h-screen bg-dark-500">
            {/* Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-gray-800">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <Link to="/" className="flex items-center space-x-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
                                <FiTrendingUp className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold gradient-text">DeFi Lend</span>
                        </Link>

                        {/* Desktop Navigation */}
                        <div className="hidden md:flex items-center space-x-1">
                            {navItems.map((item) => {
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        className={`px-4 py-2 rounded-lg flex items-center space-x-2 transition-all duration-200 ${isActive
                                            ? 'bg-primary-600/20 text-primary-400'
                                            : 'text-gray-400 hover:text-white hover:bg-dark-200'
                                            }`}
                                    >
                                        <item.icon className="w-4 h-4" />
                                        <span className="text-sm font-medium">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>

                        {/* Wallet Connection */}
                        <div className="flex items-center space-x-4">
                            {isConnected ? (
                                <div className="flex items-center space-x-3">
                                    <div className="hidden sm:block text-right">
                                        <p className="text-xs text-gray-400">{formatAddress(account)}</p>
                                        <p className="text-sm font-mono text-white">
                                            {parseFloat(balance).toFixed(4)} ETH
                                        </p>
                                    </div>
                                    <button
                                        onClick={disconnectWallet}
                                        className="px-4 py-2 bg-dark-200 hover:bg-red-500/20 border border-gray-700 
                             hover:border-red-500/50 rounded-xl text-sm font-medium text-white 
                             hover:text-red-400 transition-all duration-200"
                                    >
                                        Disconnect
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={connectWallet}
                                    disabled={isConnecting}
                                    className="px-6 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 
                           hover:from-primary-500 hover:to-primary-400 text-white font-semibold 
                           rounded-xl transition-all duration-200 flex items-center space-x-2
                           disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isConnecting ? (
                                        <>
                                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            <span>Connecting...</span>
                                        </>
                                    ) : (
                                        <span>Connect Wallet</span>
                                    )}
                                </button>
                            )}

                            {/* Mobile menu button */}
                            <button
                                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                                className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-dark-200"
                            >
                                {isMobileMenuOpen ? <FiX className="w-6 h-6" /> : <FiMenu className="w-6 h-6" />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Navigation */}
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden border-t border-gray-800"
                    >
                        <div className="px-4 py-4 space-y-2">
                            {navItems.map((item) => {
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setIsMobileMenuOpen(false)}
                                        className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive
                                            ? 'bg-primary-600/20 text-primary-400'
                                            : 'text-gray-400 hover:text-white hover:bg-dark-200'
                                            }`}
                                    >
                                        <item.icon className="w-5 h-5" />
                                        <span className="font-medium">{item.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </nav>

            {/* Main Content */}
            <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>

            {/* Footer */}
            <footer className="border-t border-gray-800 py-8 mt-auto">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
                        <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-purple flex items-center justify-center">
                                <FiTrendingUp className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-semibold text-white">DeFi Lend</span>
                        </div>
                        <p className="text-sm text-gray-500">
                            ML-Powered Variable Interest Rates • Built for DeFi
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
