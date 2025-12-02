"""
Prediction Service

Handles ML-based cryptocurrency price predictions using the LSTM model.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, Optional
from loguru import logger
import yfinance as yf

from app.ml.lstm_model import LSTMPricePredictor, fetch_crypto_data
from app.services.market_data_service import MarketDataService
from app.config import settings


class PredictionService:
    """Service for managing price predictions using trained LSTM models"""
    
    # Mapping from crypto IDs to yfinance symbols and model names
    CRYPTO_MAP = {
        "ethereum": {"symbol": "ETH-USD", "model_id": "ethereum"},
        "bitcoin": {"symbol": "BTC-USD", "model_id": "bitcoin"},
        "eth": {"symbol": "ETH-USD", "model_id": "ethereum"},
        "btc": {"symbol": "BTC-USD", "model_id": "bitcoin"},
        "matic-network": {"symbol": "MATIC-USD", "model_id": "ethereum"},  # Use ETH model as fallback
        "polygon": {"symbol": "MATIC-USD", "model_id": "ethereum"},
        "chainlink": {"symbol": "LINK-USD", "model_id": "ethereum"},
        "uniswap": {"symbol": "UNI-USD", "model_id": "ethereum"},
        "solana": {"symbol": "SOL-USD", "model_id": "ethereum"},
    }
    
    def __init__(self):
        self.predictor = LSTMPricePredictor(
            lookback_period=settings.LOOKBACK_PERIOD,
            prediction_horizon=settings.PREDICTION_HORIZON
        )
        self.market_service = MarketDataService()
        self.prediction_cache = {}
        self.cache_duration = timedelta(minutes=15)  # Cache predictions for 15 minutes
        self._models_loaded = {}  # Track loaded models
    
    def _get_crypto_info(self, crypto_id: str) -> Dict:
        """Get symbol and model info for a cryptocurrency"""
        crypto_lower = crypto_id.lower()
        if crypto_lower in self.CRYPTO_MAP:
            return self.CRYPTO_MAP[crypto_lower]
        # Default to ethereum model for unknown cryptos
        return {"symbol": f"{crypto_id.upper()}-USD", "model_id": "ethereum"}
    
    async def get_prediction(self, crypto_id: str = "ethereum") -> Dict:
        """
        Get price prediction for a cryptocurrency using trained LSTM model.
        
        Args:
            crypto_id: Cryptocurrency ID (e.g., 'ethereum', 'bitcoin')
            
        Returns:
            Dictionary with predictions and metadata
        """
        try:
            # Check cache first
            cache_key = f"pred_{crypto_id}"
            if cache_key in self.prediction_cache:
                cached_data, cached_time = self.prediction_cache[cache_key]
                if datetime.now() - cached_time < self.cache_duration:
                    logger.info(f"Returning cached prediction for {crypto_id}")
                    return cached_data
            
            # Get crypto info
            crypto_info = self._get_crypto_info(crypto_id)
            symbol = crypto_info["symbol"]
            model_id = crypto_info["model_id"]
            
            logger.info(f"Getting prediction for {crypto_id} (symbol: {symbol}, model: {model_id})")
            
            # Check if model exists and load it
            model_loaded = self.predictor.load_model(model_id)
            
            if not model_loaded:
                logger.warning(f"No trained model for {model_id}, using fallback prediction")
                return await self._fallback_prediction(crypto_id)
            
            # Fetch data directly from yfinance for accurate predictions
            try:
                df = fetch_crypto_data(symbol=symbol, period="6mo", interval="1d")
                logger.info(f"Fetched {len(df)} records for {symbol} from yfinance")
            except Exception as e:
                logger.warning(f"Failed to fetch yfinance data: {e}, using market service")
                df = await self.market_service.get_price_dataframe(
                    crypto_id,
                    days=settings.LOOKBACK_PERIOD + 30
                )
            
            if len(df) < settings.LOOKBACK_PERIOD:
                logger.warning(f"Insufficient data for {crypto_id}: only {len(df)} records")
                return await self._fallback_prediction(crypto_id)
            
            # Make prediction using the trained model
            prediction = self.predictor.predict(df, model_id)
            
            # Add metadata
            prediction['cryptocurrency'] = crypto_id
            prediction['symbol'] = symbol
            prediction['prediction_date'] = datetime.now().isoformat()
            prediction['model_version'] = '1.0.0'
            prediction['model_id'] = model_id
            prediction['data_source'] = 'yfinance'
            
            # Cache prediction
            self.prediction_cache[cache_key] = (prediction, datetime.now())
            
            logger.info(f"Prediction for {crypto_id}: trend={prediction['trend']}, "
                       f"confidence={prediction['confidence_score']:.2%}")
            
            return prediction
            
        except Exception as e:
            logger.error(f"Error getting prediction for {crypto_id}: {e}")
            import traceback
            traceback.print_exc()
            return await self._fallback_prediction(crypto_id)
    
    async def train_model(self, crypto_id: str = "ethereum") -> Dict:
        """
        Train the LSTM model for a cryptocurrency using yfinance data.
        
        Args:
            crypto_id: Cryptocurrency ID (e.g., 'ethereum', 'bitcoin')
            
        Returns:
            Dictionary with training metrics
        """
        try:
            # Get crypto info
            crypto_info = self._get_crypto_info(crypto_id)
            symbol = crypto_info["symbol"]
            model_id = crypto_info["model_id"]
            
            logger.info(f"Fetching training data for {crypto_id} (symbol: {symbol})")
            
            # Get historical data from yfinance (1 year for training)
            try:
                df = fetch_crypto_data(symbol=symbol, period="1y", interval="1d")
                logger.info(f"Fetched {len(df)} records from yfinance")
            except Exception as e:
                logger.warning(f"yfinance failed: {e}, using market service")
                df = await self.market_service.get_price_dataframe(crypto_id, days=365)
            
            if len(df) < settings.LOOKBACK_PERIOD * 2:
                raise ValueError(f"Insufficient data for training: {len(df)} rows")
            
            logger.info(f"Training LSTM model for {model_id} with {len(df)} data points")
            
            # Create a new predictor instance for training
            trainer = LSTMPricePredictor(
                lookback_period=settings.LOOKBACK_PERIOD,
                prediction_horizon=settings.PREDICTION_HORIZON
            )
            
            # Train the model
            metrics = trainer.train(
                df,
                epochs=50,  # Reduced epochs for faster training
                batch_size=32,
                crypto_id=model_id
            )
            
            # Clear cache after training
            cache_key = f"pred_{crypto_id}"
            if cache_key in self.prediction_cache:
                del self.prediction_cache[cache_key]
            
            # Mark model as needing reload
            self._models_loaded[model_id] = False
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error training model for {crypto_id}: {e}")
            import traceback
            traceback.print_exc()
            raise
    
    async def get_volatility_prediction(self, crypto_id: str = "ethereum") -> Dict:
        """
        Get volatility prediction based on price predictions.
        
        Args:
            crypto_id: Cryptocurrency ID
            
        Returns:
            Dictionary with volatility metrics for interest rate calculation
        """
        prediction = await self.get_prediction(crypto_id)
        
        volatility_metrics = self.predictor.calculate_volatility_metrics(prediction)
        volatility_metrics['cryptocurrency'] = crypto_id
        volatility_metrics['prediction_date'] = datetime.now().isoformat()
        
        # Add additional metrics useful for interest rate calculation
        volatility_metrics['confidence_score'] = prediction.get('confidence_score', 0.5)
        volatility_metrics['trend'] = prediction.get('trend', 'neutral')
        volatility_metrics['predicted_change_percent'] = prediction.get('predicted_change_percent', 0)
        
        return volatility_metrics
    
    async def _fallback_prediction(self, crypto_id: str) -> Dict:
        """
        Fallback prediction using simple trend analysis with technical indicators.
        
        Used when LSTM model is not available.
        """
        try:
            market_data = await self.market_service.get_market_data(crypto_id)
            history = await self.market_service.get_price_history(crypto_id, days=30)
            
            current_price = market_data.get('current_price', 0)
            if current_price == 0:
                current_price = history[-1]['price'] if history else 100
        except Exception as e:
            logger.error(f"Error fetching market data for fallback: {e}")
            # Use mock values
            current_price = {"ethereum": 2500, "bitcoin": 45000}.get(crypto_id.lower(), 100)
            history = []
        
        # Calculate simple moving average trend
        if history:
            prices = [h['price'] for h in history]
            ma_7 = sum(prices[-7:]) / 7 if len(prices) >= 7 else current_price
            ma_14 = sum(prices[-14:]) / 14 if len(prices) >= 14 else current_price
            ma_30 = sum(prices) / len(prices) if prices else current_price
            
            # Calculate volatility
            if len(prices) > 1:
                returns = np.diff(prices) / prices[:-1]
                volatility = np.std(returns)
            else:
                volatility = 0.03
        else:
            ma_7 = ma_14 = ma_30 = current_price
            volatility = 0.03
        
        # Simple trend projection based on moving averages
        short_trend = (current_price - ma_7) / ma_7 if ma_7 else 0
        long_trend = (current_price - ma_30) / ma_30 if ma_30 else 0
        combined_trend = (short_trend * 0.6 + long_trend * 0.4)
        
        predictions = []
        predicted_price = current_price
        
        for day in range(1, settings.PREDICTION_HORIZON + 1):
            # Trend continuation with dampening and mean reversion
            daily_change = combined_trend / settings.PREDICTION_HORIZON * 0.3
            # Add some mean reversion
            mean_reversion = (ma_30 - predicted_price) / ma_30 * 0.02 if ma_30 else 0
            predicted_price *= (1 + daily_change + mean_reversion)
            
            # Calculate confidence interval based on volatility
            interval = predicted_price * volatility * np.sqrt(day) * 1.96
            
            predictions.append({
                'date': (datetime.now() + timedelta(days=day)).strftime('%Y-%m-%d'),
                'predicted_price': float(predicted_price),
                'lower_bound': float(predicted_price - interval),
                'upper_bound': float(predicted_price + interval),
                'day': day
            })
        
        final_predicted = predictions[-1]['predicted_price']
        predicted_change = (final_predicted - current_price) / current_price * 100
        
        return {
            'cryptocurrency': crypto_id,
            'current_price': float(current_price),
            'predictions': predictions,
            'prediction_date': datetime.now().isoformat(),
            'confidence_score': 0.55,  # Lower confidence for fallback
            'prediction_volatility': float(volatility * current_price),
            'trend': 'bullish' if predicted_change > 0 else 'bearish',
            'predicted_change_percent': float(predicted_change),
            'model_version': 'fallback_v1',
            'data_source': 'market_service'
        }


# Singleton instance
prediction_service = PredictionService()
