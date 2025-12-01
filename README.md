# DeFi Lending Platform with ML-Powered Interest Rates

A decentralized finance (DeFi) lending platform that uses LSTM-based machine learning to predict cryptocurrency prices and dynamically adjust interest rates for borrowers.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  MetaMask   │  │  Dashboard  │  │  Lending/Borrowing UI   │  │
│  │ Integration │  │   Charts    │  │   Interest Rate Display │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (FastAPI)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ LSTM Price  │  │  Interest   │  │   Market Data           │  │
│  │ Prediction  │  │  Rate Calc  │  │   Aggregation           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Smart Contracts (Solidity)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Lending   │  │  Borrowing  │  │   Interest Rate Oracle  │  │
│  │    Pool     │  │   Manager   │  │       Contract          │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Features

- **MetaMask Integration**: Seamless wallet connection and transaction signing
- **ML-Powered Interest Rates**: LSTM model predicts market trends to calculate optimal interest rates
- **Real-time Dashboard**: Interactive charts and analytics
- **Variable Interest Rates**: Dynamic rates based on:
  - Market volatility
  - Price predictions
  - Supply/demand ratio
  - Collateral health factor

## 📁 Project Structure

```
├── backend/                 # Python FastAPI backend
│   ├── app/
│   │   ├── api/            # API routes
│   │   ├── ml/             # LSTM model for price prediction
│   │   ├── services/       # Business logic
│   │   └── utils/          # Helper functions
│   ├── requirements.txt
│   └── main.py
│
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks (MetaMask, etc.)
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   └── utils/          # Helper functions
│   └── package.json
│
├── contracts/              # Solidity smart contracts
│   ├── LendingPool.sol
│   ├── BorrowingManager.sol
│   └── InterestRateOracle.sol
│
└── scripts/                # Deployment scripts
```

## 🛠️ Tech Stack

- **Frontend**: React, ethers.js, Chart.js, TailwindCSS
- **Backend**: Python, FastAPI, TensorFlow/Keras (LSTM)
- **Blockchain**: Solidity, Hardhat, Ethereum/Polygon
- **Data**: CoinGecko API, Web3 providers

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- Python 3.10+
- MetaMask browser extension
- Git

### Installation

1. **Clone the repository**
```bash
cd "Major Project"
```

2. **Setup Backend**
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file and configure
cp .env.example .env
# Edit .env with your API keys

# Run the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

3. **Setup Frontend**
```bash
cd frontend

# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env.local
# Edit .env.local with your configuration

# Run development server
npm run dev
```

4. **Deploy Smart Contracts**
```bash
cd contracts

# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your private key and RPC URLs

# Start local node (in a separate terminal)
npx hardhat node

# Deploy to local network
npx hardhat run scripts/deploy.js --network localhost

# Or deploy to Sepolia testnet
npx hardhat run scripts/deploy.js --network sepolia
```

5. **Update Contract Addresses**
After deployment, update the contract addresses in:
- `frontend/src/contracts/addresses.js`
- `backend/.env`

### Running Tests

**Backend Tests**
```bash
cd backend
pytest tests/ -v
```

**Smart Contract Tests**
```bash
cd contracts
npx hardhat test
```

## 📊 Interest Rate Calculation

The interest rate is calculated using:

```
Final Rate = Base Rate + ML Premium + Utilization Factor + Time Factor

Where:
- Base Rate: Minimum interest rate (e.g., 2%)
- ML Premium: Based on LSTM-predicted price volatility (0-15%)
- Utilization Factor: Supply/Demand ratio in the lending pool (0-20%)
- Time Factor: Adjustment based on loan duration
```

### LSTM Model Architecture

```
Input (60 days) → LSTM(128) → Dropout(0.2) → LSTM(64) → Dropout(0.2) → LSTM(32) → Dense(1) → Output
```

The model is trained on historical price data and predicts:
- Future price movements (7-day forecast)
- Market volatility
- Trend direction (bullish/bearish/neutral)

## 🔐 Security Considerations

- All smart contracts follow OpenZeppelin standards
- Oracle manipulation prevention through staleness checks
- Flash loan attack prevention via health factor checks
- Liquidation mechanism protects lenders
- Rate limits on API endpoints
- CORS protection enabled

## 🌐 Supported Networks

| Network | Chain ID | Status |
|---------|----------|--------|
| Ethereum Mainnet | 1 | Ready |
| Sepolia Testnet | 11155111 | Ready |
| Polygon Mainnet | 137 | Ready |
| Mumbai Testnet | 80001 | Ready |
| Hardhat Local | 31337 | Ready |

## 📱 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/predictions/{asset}` | GET | Get price predictions |
| `/api/v1/interest-rates/{asset}` | GET | Get current interest rate |
| `/api/v1/market/{asset}` | GET | Get market data |
| `/api/v1/pools/{asset}` | GET | Get pool statistics |

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This is a educational project. Do not use in production without proper security audits. The ML predictions are for demonstration purposes and should not be used for financial decisions.
