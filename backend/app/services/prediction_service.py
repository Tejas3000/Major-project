"""
Prediction Service

Handles ML-based cryptocurrency price predictions using the LSTM model.
"""
import pandas as pd
from datetime import datetime
from typing import Dict, Optional
from loguru import logger

from app.ml.lstm_model import LSTMPricePredictor
from app.services.market_data_service import MarketDataService
from app.config import settings


class PredictionService:
    """Service for managing price predictions"""
    
    def __init__(self):
        self.predictor = LSTMPricePredictor(
            lookback_period=settings.LOOKBACK_PERIOD,
            prediction_horizon=settings.PREDICTION_HORIZON
        )
        self.market_service = MarketDataService()
        self.prediction_cache = {}
    
    async def get_prediction(self, crypto_id: str = "ethereum") -> Dict:
        """
        Get price prediction for a cryptocurrency.
        
        Args:
            crypto_id: CoinGecko cryptocurrency ID
            
        Returns:
            Dictionary with predictions and metadata
        """
        try:
            # Check if model exists
            model_loaded = self.predictor.load_model(crypto_id)
            
            if not model_loaded:
                logger.warning(f"No trained model for {crypto_id}, using fallback prediction")
                return await self._fallback_prediction(crypto_id)
            
            # Get recent price data
            df = await self.market_service.get_price_dataframe(
                crypto_id,
                days=settings.LOOKBACK_PERIOD + 30  # Extra days for feature calculation
            )
            
            if len(df) < settings.LOOKBACK_PERIOD:
                logger.warning(f"Insufficient data for {crypto_id}")
                return await self._fallback_prediction(crypto_id)
            
            # Make prediction
            prediction = self.predictor.predict(df, crypto_id)
            
            # Add metadata
            prediction['cryptocurrency'] = crypto_id
            prediction['prediction_date'] = datetime.now().isoformat()
            prediction['model_version'] = '1.0.0'
            
            # Cache prediction
            self.prediction_cache[crypto_id] = prediction
            
            return prediction
            
        except Exception as e:
            logger.error(f"Error getting prediction for {crypto_id}: {e}")
            return await self._fallback_prediction(crypto_id)
    
    async def train_model(self, crypto_id: str = "ethereum") -> Dict:
        """
        Train the LSTM model for a cryptocurrency.
        
        Args:
            crypto_id: CoinGecko cryptocurrency ID
            
        Returns:
            Dictionary with training metrics
        """
        try:
            logger.info(f"Fetching training data for {crypto_id}")
            
            # Get historical data (1 year for training)
            df = await self.market_service.get_price_dataframe(crypto_id, days=365)
            
            if len(df) < settings.LOOKBACK_PERIOD * 2:
                raise ValueError(f"Insufficient data for training: {len(df)} rows")
            
            logger.info(f"Training LSTM model for {crypto_id} with {len(df)} data points")
            
            # Train the model
            metrics = self.predictor.train(
                df,
                epochs=100,
                batch_size=32,
                crypto_id=crypto_id
            )
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error training model for {crypto_id}: {e}")
            raise
    
    async def get_volatility_prediction(self, crypto_id: str = "ethereum") -> Dict:
        """
        Get volatility prediction based on price predictions.
        
        Args:
            crypto_id: CoinGecko cryptocurrency ID
            
        Returns:
            Dictionary with volatility metrics
        """
        prediction = await self.get_prediction(crypto_id)
        
        volatility_metrics = self.predictor.calculate_volatility_metrics(prediction)
        volatility_metrics['cryptocurrency'] = crypto_id
        volatility_metrics['prediction_date'] = datetime.now().isoformat()
        
        return volatility_metrics
    
    async def _fallback_prediction(self, crypto_id: str) -> Dict:
        """
        Fallback prediction using simple trend analysis.
        
        Used when LSTM model is not available.
        """
        market_data = await self.market_service.get_market_data(crypto_id)
        history = await self.market_service.get_price_history(crypto_id, days=30)
        
        current_price = market_data['current_price']
        
        # Calculate simple moving average trend
        prices = [h['price'] for h in history]
        ma_7 = sum(prices[-7:]) / 7 if len(prices) >= 7 else current_price
        ma_30 = sum(prices) / len(prices) if prices else current_price
        
        # Simple trend projection
        trend = (current_price - ma_30) / ma_30
        
        predictions = []
        predicted_price = current_price
        
        for day in range(1, settings.PREDICTION_HORIZON + 1):
            # Simple trend continuation with dampening
            daily_change = trend / settings.PREDICTION_HORIZON * 0.5
            predicted_price *= (1 + daily_change)
            
            predictions.append({
                'date': (datetime.now().date().__str__()),
                'predicted_price': predicted_price,
                'lower_bound': predicted_price * 0.95,
                'upper_bound': predicted_price * 1.05,
                'day': day
            })
        
        return {
            'cryptocurrency': crypto_id,
            'current_price': current_price,
            'predictions': predictions,
            'prediction_date': datetime.now().isoformat(),
            'confidence_score': 0.6,  # Lower confidence for fallback
            'trend': 'bullish' if trend > 0 else 'bearish',
            'predicted_change_percent': trend * 100,
            'model_version': 'fallback_v1'
        }


# Singleton instance
prediction_service = PredictionService()
