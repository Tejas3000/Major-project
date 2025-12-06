"""
API Routes for DeFi Platform
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
from loguru import logger

from app.services.interest_rate_service import InterestRateService
from app.services.market_data_service import MarketDataService
from app.services.prediction_service import PredictionService
from app.ml.lstm_model import LSTMPricePredictor
import os

router = APIRouter()

# Initialize services
market_service = MarketDataService()
prediction_service = PredictionService()
interest_service = InterestRateService()

# Pydantic models for request/response
class PricePredictionResponse(BaseModel):
    cryptocurrency: str
    current_price: float
    predictions: List[dict]
    prediction_date: str
    confidence_score: float

class InterestRateResponse(BaseModel):
    cryptocurrency: str
    current_rate: float
    base_rate: float
    volatility_premium: float
    utilization_factor: float
    risk_adjustment: float
    effective_rate: float
    next_update: str

class MarketDataResponse(BaseModel):
    asset: str
    ticker: Optional[str] = None
    name: Optional[str] = None
    current_price: float
    previous_close: Optional[float] = None
    price_change_24h: float
    price_change_7d: Optional[float] = None
    market_cap: Optional[float] = None
    volume_24h: Optional[float] = None
    high_24h: Optional[float] = None
    low_24h: Optional[float] = None
    open_price: Optional[float] = None
    currency: Optional[str] = "USD"
    exchange: Optional[str] = None
    last_updated: str
    source: Optional[str] = None

class LendingPoolStats(BaseModel):
    total_supplied: float
    total_borrowed: float
    utilization_rate: float
    available_liquidity: float
    current_interest_rate: float

class BorrowRequest(BaseModel):
    wallet_address: str
    cryptocurrency: str
    amount: float
    collateral_amount: float
    collateral_type: str

class SupplyRequest(BaseModel):
    wallet_address: str
    cryptocurrency: str
    amount: float


# ==================== Market Data Routes ====================

@router.get("/market/{crypto}", response_model=MarketDataResponse)
async def get_market_data(crypto: str = "ethereum"):
    """Get current market data for a cryptocurrency"""
    try:
        data = await market_service.get_market_data(crypto)
        return data
    except Exception as e:
        logger.error(f"Error fetching market data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/market/{crypto}/history")
async def get_price_history(
    crypto: str = "ethereum",
    days: int = Query(default=30, le=365)
):
    """Get historical price data for a cryptocurrency"""
    try:
        history = await market_service.get_price_history(crypto, days)
        return {"cryptocurrency": crypto, "history": history}
    except Exception as e:
        logger.error(f"Error fetching price history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Prediction Routes ====================

@router.get("/predictions/{crypto}", response_model=PricePredictionResponse)
async def get_price_prediction(crypto: str = "ethereum"):
    """Get ML-based price prediction for a cryptocurrency"""
    try:
        prediction = await prediction_service.get_prediction(crypto)
        return prediction
    except Exception as e:
        logger.error(f"Error getting prediction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/predictions/train/{crypto}")
async def train_model(crypto: str = "ethereum"):
    """Trigger model training for a cryptocurrency"""
    try:
        result = await prediction_service.train_model(crypto)
        return {"status": "success", "message": f"Model trained for {crypto}", "metrics": result}
    except Exception as e:
        logger.error(f"Error training model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predictions/{crypto}/volatility")
async def get_volatility_prediction(crypto: str = "ethereum"):
    """Get ML-based volatility prediction for interest rate calculation"""
    try:
        volatility = await prediction_service.get_volatility_prediction(crypto)
        return volatility
    except Exception as e:
        logger.error(f"Error getting volatility prediction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/model/status")
async def get_model_status():
    """Get status of trained ML models"""
    try:
        model_dir = "app/ml/models"
        models = {}
        
        for crypto_id in ["ethereum", "bitcoin"]:
            model_path = os.path.join(model_dir, f"{crypto_id}_lstm_model.keras")
            scaler_path = os.path.join(model_dir, f"{crypto_id}_scaler.pkl")
            feature_scaler_path = os.path.join(model_dir, f"{crypto_id}_feature_scaler.pkl")
            
            models[crypto_id] = {
                "model_exists": os.path.exists(model_path),
                "scaler_exists": os.path.exists(scaler_path),
                "feature_scaler_exists": os.path.exists(feature_scaler_path),
                "ready": all([
                    os.path.exists(model_path),
                    os.path.exists(scaler_path),
                    os.path.exists(feature_scaler_path)
                ])
            }
            
            if os.path.exists(model_path):
                import datetime
                models[crypto_id]["last_modified"] = datetime.datetime.fromtimestamp(
                    os.path.getmtime(model_path)
                ).isoformat()
        
        return {
            "models": models,
            "model_directory": model_dir,
            "prediction_horizon": 7,
            "lookback_period": 60
        }
    except Exception as e:
        logger.error(f"Error getting model status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Interest Rate Routes ====================

@router.get("/interest-rate/{crypto}", response_model=InterestRateResponse)
async def get_interest_rate(crypto: str = "ethereum"):
    """Get current variable interest rate for a cryptocurrency"""
    try:
        rate = await interest_service.calculate_interest_rate(crypto)
        return rate
    except Exception as e:
        logger.error(f"Error calculating interest rate: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/interest-rate/{crypto}/history")
async def get_interest_rate_history(
    crypto: str = "ethereum",
    days: int = Query(default=30, le=365)
):
    """Get historical interest rates"""
    try:
        history = await interest_service.get_rate_history(crypto, days)
        return {"cryptocurrency": crypto, "history": history}
    except Exception as e:
        logger.error(f"Error fetching rate history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Lending Pool Routes ====================

@router.get("/pool/{crypto}/stats", response_model=LendingPoolStats)
async def get_pool_stats(crypto: str = "ethereum"):
    """Get lending pool statistics"""
    try:
        stats = await interest_service.get_pool_stats(crypto)
        return stats
    except Exception as e:
        logger.error(f"Error fetching pool stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pool/supply")
async def supply_to_pool(request: SupplyRequest):
    """Supply assets to the lending pool"""
    try:
        # This returns data needed for the frontend to construct the transaction
        tx_data = await interest_service.prepare_supply_transaction(
            request.wallet_address,
            request.cryptocurrency,
            request.amount
        )
        return {"status": "prepared", "transaction_data": tx_data}
    except Exception as e:
        logger.error(f"Error preparing supply transaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/pool/borrow")
async def borrow_from_pool(request: BorrowRequest):
    """Borrow assets from the lending pool"""
    try:
        # Calculate interest rate based on current market conditions
        interest_rate = await interest_service.calculate_borrow_rate(
            request.cryptocurrency,
            request.amount,
            request.collateral_amount,
            request.collateral_type
        )
        
        # Prepare transaction data for MetaMask
        tx_data = await interest_service.prepare_borrow_transaction(
            request.wallet_address,
            request.cryptocurrency,
            request.amount,
            request.collateral_amount,
            request.collateral_type
        )
        
        return {
            "status": "prepared",
            "interest_rate": interest_rate,
            "transaction_data": tx_data
        }
    except Exception as e:
        logger.error(f"Error preparing borrow transaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== User Routes ====================

@router.get("/user/{wallet_address}/positions")
async def get_user_positions(wallet_address: str):
    """Get user's lending and borrowing positions"""
    try:
        positions = await interest_service.get_user_positions(wallet_address)
        return positions
    except Exception as e:
        logger.error(f"Error fetching user positions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/user/{wallet_address}/health-factor")
async def get_health_factor(wallet_address: str):
    """Get user's health factor (collateral ratio)"""
    try:
        health = await interest_service.calculate_health_factor(wallet_address)
        return health
    except Exception as e:
        logger.error(f"Error calculating health factor: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== System Routes ====================

@router.get("/supported-assets")
async def get_supported_assets():
    """Get list of supported cryptocurrencies"""
    return {
        "assets": [
            {"id": "ethereum", "symbol": "ETH", "name": "Ethereum"},
            {"id": "bitcoin", "symbol": "BTC", "name": "Bitcoin"},
            {"id": "chainlink", "symbol": "LINK", "name": "Chainlink"},
            {"id": "uniswap", "symbol": "UNI", "name": "Uniswap"},
        ]
    }

@router.get("/volatility/{crypto}")
async def get_volatility(crypto: str = "ethereum"):
    """Get current market volatility metrics"""
    try:
        volatility = await market_service.calculate_volatility(crypto)
        return volatility
    except Exception as e:
        logger.error(f"Error calculating volatility: {e}")
        raise HTTPException(status_code=500, detail=str(e))
