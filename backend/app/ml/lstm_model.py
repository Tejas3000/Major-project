"""
LSTM-based Cryptocurrency Price Prediction Model

This module implements a Long Short-Term Memory (LSTM) neural network
for predicting cryptocurrency prices. The predictions are used to
calculate variable interest rates for the DeFi lending platform.
"""
import numpy as np
import pandas as pd
from typing import Tuple, List, Optional, Dict
import tensorflow as tf
from tensorflow import keras
from keras.models import Sequential, load_model
from keras.layers import LSTM, Dense, Dropout, BatchNormalization, Bidirectional
from keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from keras.optimizers import Adam
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import os
from loguru import logger
from datetime import datetime, timedelta
import joblib
import yfinance as yf


class LSTMPricePredictor:
    """
    LSTM-based model for cryptocurrency price prediction.
    
    The model uses historical price data to predict future prices,
    which are then used to calculate volatility and interest rates.
    """
    
    def __init__(
        self,
        lookback_period: int = 60,
        prediction_horizon: int = 7,
        model_dir: str = "app/ml/models"
    ):
        """
        Initialize the LSTM predictor.
        
        Args:
            lookback_period: Number of days of historical data to use
            prediction_horizon: Number of days to predict ahead
            model_dir: Directory to save/load models
        """
        self.lookback_period = lookback_period
        self.prediction_horizon = prediction_horizon
        self.model_dir = model_dir
        self.model: Optional[Sequential] = None
        self.scaler = MinMaxScaler(feature_range=(0, 1))
        self.feature_scaler = MinMaxScaler(feature_range=(0, 1))
        
        # Create model directory if it doesn't exist
        os.makedirs(model_dir, exist_ok=True)
        
    def _build_model(self, input_shape: Tuple[int, int]) -> Sequential:
        """
        Build the LSTM model architecture.
        
        Architecture:
        - LSTM layers for capturing temporal patterns
        - Dropout layers for regularization
        - Dense output layer for predictions
        
        Args:
            input_shape: Shape of input data (timesteps, features)
            
        Returns:
            Compiled Keras Sequential model
        """
        model = Sequential([
            # First LSTM layer
            LSTM(64, return_sequences=True, input_shape=input_shape),
            Dropout(0.2),
            
            # Second LSTM layer
            LSTM(32, return_sequences=False),
            Dropout(0.2),
            
            # Dense layers
            Dense(32, activation='relu'),
            Dense(16, activation='relu'),
            
            # Output layer - predict next N days
            Dense(self.prediction_horizon)
        ])
        
        # Compile with Adam optimizer
        optimizer = Adam(learning_rate=0.001)
        model.compile(
            optimizer=optimizer,
            loss='huber',  # Huber loss is more robust to outliers
            metrics=['mae', 'mse']
        )
        
        logger.info(f"Model built with input shape: {input_shape}")
        model.summary()
        
        return model
    
    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare technical indicators and features for the model.
        
        Args:
            df: DataFrame with OHLCV data
            
        Returns:
            DataFrame with additional technical features
        """
        df = df.copy()
        
        # Price-based features
        df['price'] = df['close'] if 'close' in df.columns else df['price']
        
        # Moving averages
        df['ma_7'] = df['price'].rolling(window=7).mean()
        df['ma_14'] = df['price'].rolling(window=14).mean()
        df['ma_30'] = df['price'].rolling(window=30).mean()
        
        # Exponential moving averages
        df['ema_7'] = df['price'].ewm(span=7, adjust=False).mean()
        df['ema_14'] = df['price'].ewm(span=14, adjust=False).mean()
        
        # Volatility (Rolling standard deviation)
        df['volatility_7'] = df['price'].rolling(window=7).std()
        df['volatility_14'] = df['price'].rolling(window=14).std()
        
        # Price momentum
        df['momentum_7'] = df['price'].pct_change(periods=7)
        df['momentum_14'] = df['price'].pct_change(periods=14)
        
        # Relative Strength Index (RSI)
        df['rsi'] = self._calculate_rsi(df['price'], window=14)
        
        # MACD
        exp1 = df['price'].ewm(span=12, adjust=False).mean()
        exp2 = df['price'].ewm(span=26, adjust=False).mean()
        df['macd'] = exp1 - exp2
        df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
        
        # Bollinger Bands
        bb_window = 20
        df['bb_middle'] = df['price'].rolling(window=bb_window).mean()
        bb_std = df['price'].rolling(window=bb_window).std()
        df['bb_upper'] = df['bb_middle'] + (2 * bb_std)
        df['bb_lower'] = df['bb_middle'] - (2 * bb_std)
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['bb_middle']
        
        # Price relative to Bollinger Bands
        df['bb_position'] = (df['price'] - df['bb_lower']) / (df['bb_upper'] - df['bb_lower'])
        
        # Log returns
        df['log_return'] = np.log(df['price'] / df['price'].shift(1))
        
        # Drop NaN values
        df = df.dropna()
        
        return df
    
    def _calculate_rsi(self, prices: pd.Series, window: int = 14) -> pd.Series:
        """Calculate Relative Strength Index"""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=window).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=window).mean()
        rs = gain / loss
        return 100 - (100 / (1 + rs))
    
    def prepare_data(
        self,
        df: pd.DataFrame,
        target_col: str = 'price'
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prepare data for LSTM training.
        
        Args:
            df: DataFrame with price data and features
            target_col: Column name for the target variable
            
        Returns:
            Tuple of (X, y) arrays ready for training
        """
        # Prepare features
        df = self.prepare_features(df)
        
        # Select features for training
        feature_columns = [
            'price', 'ma_7', 'ma_14', 'ma_30', 'ema_7', 'ema_14',
            'volatility_7', 'volatility_14', 'momentum_7', 'momentum_14',
            'rsi', 'macd', 'macd_signal', 'bb_width', 'bb_position', 'log_return'
        ]
        
        # Filter available columns
        available_features = [col for col in feature_columns if col in df.columns]
        
        data = df[available_features].values
        target = df[target_col].values
        
        # Scale features
        scaled_data = self.feature_scaler.fit_transform(data)
        scaled_target = self.scaler.fit_transform(target.reshape(-1, 1))
        
        X, y = [], []
        
        for i in range(self.lookback_period, len(scaled_data) - self.prediction_horizon + 1):
            X.append(scaled_data[i - self.lookback_period:i])
            y.append(scaled_target[i:i + self.prediction_horizon].flatten())
        
        return np.array(X), np.array(y)
    
    def train(
        self,
        df: pd.DataFrame,
        epochs: int = 100,
        batch_size: int = 32,
        validation_split: float = 0.2,
        crypto_id: str = "ethereum"
    ) -> Dict:
        """
        Train the LSTM model on historical price data.
        
        Args:
            df: DataFrame with price data
            epochs: Number of training epochs
            batch_size: Batch size for training
            validation_split: Fraction of data for validation
            crypto_id: Cryptocurrency identifier for model naming
            
        Returns:
            Dictionary with training metrics
        """
        logger.info(f"Starting model training for {crypto_id}")
        
        # Prepare data
        X, y = self.prepare_data(df)
        
        logger.info(f"Training data shape: X={X.shape}, y={y.shape}")
        
        # Build model
        self.model = self._build_model(input_shape=(X.shape[1], X.shape[2]))
        
        # Callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_loss',
                patience=15,
                restore_best_weights=True,
                verbose=1
            ),
            ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=5,
                min_lr=1e-6,
                verbose=1
            ),
            ModelCheckpoint(
                filepath=os.path.join(self.model_dir, f'{crypto_id}_best_model.keras'),
                monitor='val_loss',
                save_best_only=True,
                verbose=1
            )
        ]
        
        # Train model
        history = self.model.fit(
            X, y,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=validation_split,
            callbacks=callbacks,
            verbose=1
        )
        
        # Save model and scalers
        self.save_model(crypto_id)
        
        # Calculate metrics
        train_loss = history.history['loss'][-1]
        val_loss = history.history['val_loss'][-1]
        
        metrics = {
            'train_loss': float(train_loss),
            'val_loss': float(val_loss),
            'train_mae': float(history.history['mae'][-1]),
            'val_mae': float(history.history['val_mae'][-1]),
            'epochs_trained': len(history.history['loss']),
            'trained_at': datetime.now().isoformat()
        }
        
        logger.info(f"Training completed. Metrics: {metrics}")
        
        return metrics
    
    def predict(
        self,
        recent_data: pd.DataFrame,
        crypto_id: str = "ethereum"
    ) -> Dict:
        """
        Make price predictions using the trained model.
        
        Args:
            recent_data: Recent price data (at least lookback_period days)
            crypto_id: Cryptocurrency identifier
            
        Returns:
            Dictionary with predictions and confidence scores
        """
        # Load model if not loaded
        if self.model is None:
            self.load_model(crypto_id)
        
        # Prepare features
        df = self.prepare_features(recent_data.copy())
        
        # Select features
        feature_columns = [
            'price', 'ma_7', 'ma_14', 'ma_30', 'ema_7', 'ema_14',
            'volatility_7', 'volatility_14', 'momentum_7', 'momentum_14',
            'rsi', 'macd', 'macd_signal', 'bb_width', 'bb_position', 'log_return'
        ]
        
        available_features = [col for col in feature_columns if col in df.columns]
        data = df[available_features].values
        
        # Scale data
        scaled_data = self.feature_scaler.transform(data)
        
        # Take last lookback_period days
        X = scaled_data[-self.lookback_period:].reshape(1, self.lookback_period, -1)
        
        # Make prediction
        scaled_prediction = self.model.predict(X, verbose=0)
        
        # Inverse transform to get actual prices
        prediction = self.scaler.inverse_transform(scaled_prediction)[0]
        
        # Calculate confidence based on model uncertainty
        # Use Monte Carlo Dropout for uncertainty estimation
        predictions_mc = []
        for _ in range(50):
            pred = self.model(X, training=True)  # Enable dropout during inference
            predictions_mc.append(self.scaler.inverse_transform(pred.numpy())[0])
        
        predictions_mc = np.array(predictions_mc)
        prediction_std = np.std(predictions_mc, axis=0)
        prediction_mean = np.mean(predictions_mc, axis=0)
        
        # Confidence score (inverse of coefficient of variation)
        cv = prediction_std / np.abs(prediction_mean)
        confidence = np.clip(1 - np.mean(cv), 0.1, 0.99)
        
        # Generate prediction dates
        last_date = pd.to_datetime(recent_data.index[-1]) if isinstance(recent_data.index, pd.DatetimeIndex) else datetime.now()
        prediction_dates = [
            (last_date + timedelta(days=i+1)).strftime('%Y-%m-%d')
            for i in range(self.prediction_horizon)
        ]
        
        current_price = float(recent_data['price'].iloc[-1]) if 'price' in recent_data.columns else float(recent_data['close'].iloc[-1])
        
        return {
            'current_price': current_price,
            'predictions': [
                {
                    'date': date,
                    'predicted_price': float(pred),
                    'lower_bound': float(pred - 1.96 * std),
                    'upper_bound': float(pred + 1.96 * std),
                    'day': i + 1
                }
                for i, (date, pred, std) in enumerate(zip(prediction_dates, prediction_mean, prediction_std))
            ],
            'confidence_score': float(confidence),
            'prediction_volatility': float(np.mean(prediction_std)),
            'trend': 'bullish' if prediction_mean[-1] > current_price else 'bearish',
            'predicted_change_percent': float((prediction_mean[-1] - current_price) / current_price * 100)
        }
    
    def calculate_volatility_metrics(self, predictions: Dict) -> Dict:
        """
        Calculate volatility metrics from predictions for interest rate calculation.
        
        Args:
            predictions: Prediction dictionary from predict()
            
        Returns:
            Dictionary with volatility metrics
        """
        predicted_prices = [p['predicted_price'] for p in predictions['predictions']]
        
        # Calculate various volatility measures
        price_changes = np.diff(predicted_prices) / predicted_prices[:-1]
        
        volatility_metrics = {
            'predicted_volatility': float(np.std(price_changes)),
            'max_drawdown': float(min(0, min(price_changes))),
            'max_upside': float(max(0, max(price_changes))),
            'volatility_percentile': self._volatility_percentile(np.std(price_changes)),
            'trend_strength': abs(predictions['predicted_change_percent']),
            'risk_level': self._calculate_risk_level(np.std(price_changes), predictions['confidence_score'])
        }
        
        return volatility_metrics
    
    def _volatility_percentile(self, volatility: float) -> float:
        """Calculate volatility percentile based on historical norms"""
        # Typical daily volatility ranges for crypto
        if volatility < 0.02:
            return 0.2  # Low volatility
        elif volatility < 0.05:
            return 0.5  # Medium volatility
        elif volatility < 0.10:
            return 0.75  # High volatility
        else:
            return 0.95  # Very high volatility
    
    def _calculate_risk_level(self, volatility: float, confidence: float) -> str:
        """Calculate risk level based on volatility and confidence"""
        risk_score = volatility * (2 - confidence)
        
        if risk_score < 0.03:
            return 'low'
        elif risk_score < 0.08:
            return 'medium'
        elif risk_score < 0.15:
            return 'high'
        else:
            return 'very_high'
    
    def save_model(self, crypto_id: str):
        """Save model and scalers to disk"""
        if self.model is not None:
            model_path = os.path.join(self.model_dir, f'{crypto_id}_lstm_model.keras')
            self.model.save(model_path)
            logger.info(f"Model saved to {model_path}")
        
        # Save scalers
        scaler_path = os.path.join(self.model_dir, f'{crypto_id}_scaler.pkl')
        feature_scaler_path = os.path.join(self.model_dir, f'{crypto_id}_feature_scaler.pkl')
        
        joblib.dump(self.scaler, scaler_path)
        joblib.dump(self.feature_scaler, feature_scaler_path)
        
        logger.info(f"Scalers saved for {crypto_id}")
    
    def load_model(self, crypto_id: str) -> bool:
        """Load model and scalers from disk"""
        model_path = os.path.join(self.model_dir, f'{crypto_id}_lstm_model.keras')
        scaler_path = os.path.join(self.model_dir, f'{crypto_id}_scaler.pkl')
        feature_scaler_path = os.path.join(self.model_dir, f'{crypto_id}_feature_scaler.pkl')
        
        if os.path.exists(model_path):
            self.model = load_model(model_path)
            logger.info(f"Model loaded from {model_path}")
        else:
            logger.warning(f"No model found at {model_path}")
            return False
        
        if os.path.exists(scaler_path):
            self.scaler = joblib.load(scaler_path)
        
        if os.path.exists(feature_scaler_path):
            self.feature_scaler = joblib.load(feature_scaler_path)
        
        return True


# Singleton instance
predictor = LSTMPricePredictor()


def fetch_crypto_data(
    symbol: str = "ETH-USD",
    period: str = "2y",
    interval: str = "1d"
) -> pd.DataFrame:
    """
    Fetch cryptocurrency price data from Yahoo Finance.
    
    Args:
        symbol: Ticker symbol (e.g., "ETH-USD", "BTC-USD")
        period: Data period (e.g., "1y", "2y", "5y", "max")
        interval: Data interval (e.g., "1d", "1h")
        
    Returns:
        DataFrame with OHLCV data
    """
    logger.info(f"Fetching {symbol} data from yfinance (period={period}, interval={interval})")
    
    ticker = yf.Ticker(symbol)
    df = ticker.history(period=period, interval=interval)
    
    if df.empty:
        raise ValueError(f"No data fetched for {symbol}")
    
    # Standardize column names
    df.columns = [col.lower() for col in df.columns]
    
    # Add 'price' column (same as 'close')
    df['price'] = df['close']
    
    logger.info(f"Fetched {len(df)} records from {df.index[0]} to {df.index[-1]}")
    
    return df


def train_model_with_yfinance(
    symbol: str = "ETH-USD",
    crypto_id: str = "ethereum",
    period: str = "2y",
    epochs: int = 100,
    batch_size: int = 32
) -> Dict:
    """
    Train the LSTM model using data fetched from Yahoo Finance.
    
    Args:
        symbol: Ticker symbol (e.g., "ETH-USD", "BTC-USD")
        crypto_id: Identifier for saving the model
        period: Historical data period
        epochs: Number of training epochs
        batch_size: Training batch size
        
    Returns:
        Dictionary with training metrics
    """
    # Fetch data
    df = fetch_crypto_data(symbol=symbol, period=period)
    
    # Initialize predictor
    model_predictor = LSTMPricePredictor()
    
    # Train model
    metrics = model_predictor.train(
        df=df,
        epochs=epochs,
        batch_size=batch_size,
        crypto_id=crypto_id
    )
    
    return metrics


if __name__ == "__main__":
    import os
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TF warnings
    os.environ['CUDA_VISIBLE_DEVICES'] = '-1'  # Disable GPU
    os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'  # Disable oneDNN
    
    # Force CPU usage
    import tensorflow as tf
    tf.config.set_visible_devices([], 'GPU')
    
    # Train model for Ethereum
    print("=" * 60)
    print("LSTM Cryptocurrency Price Prediction Model Training")
    print("=" * 60)
    
    # Train on Ethereum (ETH-USD) with smaller period for faster training
    print("\n[1/2] Training model for Ethereum (ETH-USD)...")
    eth_metrics = train_model_with_yfinance(
        symbol="ETH-USD",
        crypto_id="ethereum",
        period="1y",  # Use 1 year of data
        epochs=50,    # Reduced epochs
        batch_size=32
    )
    print(f"\nEthereum Training Results:")
    print(f"  - Training Loss: {eth_metrics['train_loss']:.6f}")
    print(f"  - Validation Loss: {eth_metrics['val_loss']:.6f}")
    print(f"  - Training MAE: {eth_metrics['train_mae']:.6f}")
    print(f"  - Validation MAE: {eth_metrics['val_mae']:.6f}")
    print(f"  - Epochs Trained: {eth_metrics['epochs_trained']}")
    
    # Train on Bitcoin (BTC-USD)
    print("\n[2/2] Training model for Bitcoin (BTC-USD)...")
    btc_metrics = train_model_with_yfinance(
        symbol="BTC-USD",
        crypto_id="bitcoin",
        period="1y",  # Use 1 year of data
        epochs=50,    # Reduced epochs
        batch_size=32
    )
    print(f"\nBitcoin Training Results:")
    print(f"  - Training Loss: {btc_metrics['train_loss']:.6f}")
    print(f"  - Validation Loss: {btc_metrics['val_loss']:.6f}")
    print(f"  - Training MAE: {btc_metrics['train_mae']:.6f}")
    print(f"  - Validation MAE: {btc_metrics['val_mae']:.6f}")
    print(f"  - Epochs Trained: {btc_metrics['epochs_trained']}")
    
    print("\n" + "=" * 60)
    print("Training Complete! Models saved to app/ml/models/")
    print("=" * 60)
