import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add any auth tokens here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Market Data APIs
export const marketApi = {
  getMarketData: (crypto = 'ethereum') => api.get(`/market/${crypto}`),
  getPriceHistory: (crypto = 'ethereum', days = 30) => 
    api.get(`/market/${crypto}/history`, { params: { days } }),
  getVolatility: (crypto = 'ethereum') => api.get(`/volatility/${crypto}`),
  getSupportedAssets: () => api.get('/supported-assets'),
};

// Prediction APIs
export const predictionApi = {
  getPrediction: (crypto = 'ethereum') => api.get(`/predictions/${crypto}`),
  trainModel: (crypto = 'ethereum') => api.post(`/predictions/train/${crypto}`),
};

// Interest Rate APIs
export const interestRateApi = {
  getInterestRate: (crypto = 'ethereum') => api.get(`/interest-rate/${crypto}`),
  getRateHistory: (crypto = 'ethereum', days = 30) => 
    api.get(`/interest-rate/${crypto}/history`, { params: { days } }),
};

// Pool APIs
export const poolApi = {
  getPoolStats: (crypto = 'ethereum') => api.get(`/pool/${crypto}/stats`),
  supply: (data) => api.post('/pool/supply', data),
  borrow: (data) => api.post('/pool/borrow', data),
};

// User APIs
export const userApi = {
  getPositions: (walletAddress) => api.get(`/user/${walletAddress}/positions`),
  getHealthFactor: (walletAddress) => api.get(`/user/${walletAddress}/health-factor`),
};

export default api;
