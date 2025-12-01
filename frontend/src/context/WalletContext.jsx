import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
    const [account, setAccount] = useState(null);
    const [chainId, setChainId] = useState(null);
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [balance, setBalance] = useState('0');

    // Check if MetaMask is installed
    const isMetaMaskInstalled = typeof window !== 'undefined' && window.ethereum?.isMetaMask;

    // Connect wallet
    const connectWallet = useCallback(async () => {
        if (!isMetaMaskInstalled) {
            toast.error('Please install MetaMask to use this application');
            window.open('https://metamask.io/download/', '_blank');
            return;
        }

        setIsConnecting(true);

        try {
            // Clear disconnected flag when user explicitly connects
            localStorage.removeItem('walletDisconnected');

            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts',
            });

            if (accounts.length === 0) {
                throw new Error('No accounts found');
            }

            // Create provider and signer
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const network = await provider.getNetwork();
            const balance = await provider.getBalance(accounts[0]);

            setAccount(accounts[0]);
            setChainId(Number(network.chainId));
            setProvider(provider);
            setSigner(signer);
            setBalance(ethers.formatEther(balance));

            toast.success('Wallet connected successfully!');
        } catch (error) {
            console.error('Error connecting wallet:', error);
            if (error.code === 4001) {
                toast.error('Connection rejected by user');
            } else {
                toast.error('Failed to connect wallet');
            }
        } finally {
            setIsConnecting(false);
        }
    }, [isMetaMaskInstalled]);

    // Disconnect wallet
    const disconnectWallet = useCallback(() => {
        // Set flag to prevent auto-reconnect on refresh
        localStorage.setItem('walletDisconnected', 'true');

        setAccount(null);
        setChainId(null);
        setProvider(null);
        setSigner(null);
        setBalance('0');
        toast.success('Wallet disconnected');
    }, []);

    // Switch network
    const switchNetwork = useCallback(async (targetChainId) => {
        if (!window.ethereum) return;

        const chainIdHex = `0x${targetChainId.toString(16)}`;

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }],
            });
        } catch (error) {
            // Chain not added to MetaMask
            if (error.code === 4902) {
                // Add the network
                const networks = {
                    137: {
                        chainId: chainIdHex,
                        chainName: 'Polygon Mainnet',
                        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                        rpcUrls: ['https://polygon-rpc.com'],
                        blockExplorerUrls: ['https://polygonscan.com'],
                    },
                    80001: {
                        chainId: chainIdHex,
                        chainName: 'Polygon Mumbai Testnet',
                        nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
                        rpcUrls: ['https://rpc-mumbai.maticvigil.com'],
                        blockExplorerUrls: ['https://mumbai.polygonscan.com'],
                    },
                    11155111: {
                        chainId: chainIdHex,
                        chainName: 'Sepolia Testnet',
                        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                        rpcUrls: ['https://sepolia.infura.io/v3/'],
                        blockExplorerUrls: ['https://sepolia.etherscan.io'],
                    },
                };

                if (networks[targetChainId]) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [networks[targetChainId]],
                    });
                }
            } else {
                throw error;
            }
        }
    }, []);

    // Listen for account changes
    useEffect(() => {
        if (!window.ethereum) return;

        const handleAccountsChanged = (accounts) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else if (accounts[0] !== account) {
                setAccount(accounts[0]);
                toast.info('Account changed');
            }
        };

        const handleChainChanged = (chainId) => {
            setChainId(parseInt(chainId, 16));
            toast.info('Network changed');
            // Refresh the page to reset the provider
            window.location.reload();
        };

        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);

        return () => {
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener('chainChanged', handleChainChanged);
        };
    }, [account, disconnectWallet]);

    // Auto-connect if previously connected (and not manually disconnected)
    useEffect(() => {
        const checkConnection = async () => {
            if (!window.ethereum) return;

            // Don't auto-connect if user manually disconnected
            if (localStorage.getItem('walletDisconnected') === 'true') {
                return;
            }

            try {
                const accounts = await window.ethereum.request({
                    method: 'eth_accounts',
                });

                if (accounts.length > 0) {
                    const provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await provider.getSigner();
                    const network = await provider.getNetwork();
                    const balance = await provider.getBalance(accounts[0]);

                    setAccount(accounts[0]);
                    setChainId(Number(network.chainId));
                    setProvider(provider);
                    setSigner(signer);
                    setBalance(ethers.formatEther(balance));
                }
            } catch (error) {
                console.error('Error checking connection:', error);
            }
        };

        checkConnection();
    }, []);

    const value = {
        account,
        chainId,
        provider,
        signer,
        balance,
        isConnecting,
        isConnected: !!account,
        isMetaMaskInstalled,
        connectWallet,
        disconnectWallet,
        switchNetwork,
    };

    return (
        <WalletContext.Provider value={value}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
}
