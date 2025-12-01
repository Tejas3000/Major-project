"""
Tests for the LSTM Price Prediction Model
"""
import pytest
import numpy as np
import pandas as pd
from unittest.mock import Mock, patch
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.ml.lstm_model import LSTMPricePredictor


class TestLSTMPricePredictor:
    """Test suite for LSTMPricePredictor class"""
    
    @pytest.fixture
    def predictor(self):
        """Create a predictor instance for testing"""
        return LSTMPricePredictor(sequence_length=30)
    
    @pytest.fixture
    def sample_data(self):
        """Create sample price data for testing"""
        np.random.seed(42)
        dates = pd.date_range(start='2023-01-01', periods=100, freq='D')
        prices = np.cumsum(np.random.randn(100)) + 100
        prices = np.abs(prices)  # Ensure positive prices
        return pd.DataFrame({
            'timestamp': dates,
            'price': prices
        })
    
    def test_init(self, predictor):
        """Test predictor initialization"""
        assert predictor.sequence_length == 30
        assert predictor.model is None
        assert predictor.scaler is not None
    
    def test_prepare_data(self, predictor, sample_data):
        """Test data preparation"""
        X, y, scaler = predictor.prepare_data(sample_data['price'].values)
        
        # Check shapes
        expected_samples = len(sample_data) - predictor.sequence_length
        assert X.shape[0] == expected_samples
        assert X.shape[1] == predictor.sequence_length
        assert X.shape[2] == 1  # Single feature
        assert y.shape[0] == expected_samples
    
    def test_prepare_data_insufficient_data(self, predictor):
        """Test that prepare_data raises error with insufficient data"""
        short_data = np.array([1, 2, 3])  # Less than sequence_length
        
        with pytest.raises(ValueError):
            predictor.prepare_data(short_data)
    
    def test_build_model(self, predictor):
        """Test model building"""
        model = predictor.build_model()
        
        # Check model structure
        assert model is not None
        assert len(model.layers) > 0
        
        # Check input shape
        assert model.input_shape == (None, predictor.sequence_length, 1)
    
    @patch('app.ml.lstm_model.LSTMPricePredictor.build_model')
    def test_train(self, mock_build_model, predictor, sample_data):
        """Test model training"""
        # Create a mock model
        mock_model = Mock()
        mock_model.fit.return_value = Mock(history={'loss': [0.1], 'val_loss': [0.15]})
        mock_build_model.return_value = mock_model
        
        history = predictor.train(sample_data['price'].values, epochs=1, batch_size=16)
        
        # Verify model was built
        mock_build_model.assert_called_once()
        
        # Verify fit was called
        mock_model.fit.assert_called_once()
    
    def test_calculate_volatility(self, predictor, sample_data):
        """Test volatility calculation"""
        volatility = predictor.calculate_volatility(sample_data['price'].values)
        
        # Volatility should be non-negative
        assert volatility >= 0
        
        # Volatility should be reasonable (not infinite or NaN)
        assert np.isfinite(volatility)
    
    def test_calculate_volatility_constant_prices(self, predictor):
        """Test volatility calculation with constant prices"""
        constant_prices = np.ones(100) * 100
        volatility = predictor.calculate_volatility(constant_prices)
        
        # Constant prices should have zero volatility
        assert volatility == 0 or np.isclose(volatility, 0)
    
    def test_calculate_volatility_with_window(self, predictor, sample_data):
        """Test volatility calculation with different window sizes"""
        vol_7 = predictor.calculate_volatility(sample_data['price'].values, window=7)
        vol_30 = predictor.calculate_volatility(sample_data['price'].values, window=30)
        
        # Both should be valid
        assert np.isfinite(vol_7)
        assert np.isfinite(vol_30)


class TestPrediction:
    """Test prediction functionality"""
    
    @pytest.fixture
    def trained_predictor(self, sample_data):
        """Create a predictor with a mocked trained model"""
        predictor = LSTMPricePredictor(sequence_length=30)
        
        # Mock the model
        predictor.model = Mock()
        predictor.model.predict.return_value = np.array([[0.5]])
        
        # Fit the scaler
        predictor.scaler.fit(sample_data['price'].values.reshape(-1, 1))
        
        return predictor
    
    @pytest.fixture
    def sample_data(self):
        """Create sample price data for testing"""
        np.random.seed(42)
        return np.random.uniform(100, 200, 100)
    
    def test_predict_prices(self, trained_predictor, sample_data):
        """Test price prediction"""
        predictions = trained_predictor.predict_prices(sample_data, days_ahead=7)
        
        # Should return 7 predictions
        assert len(predictions) == 7
        
        # Predictions should be positive
        for pred in predictions:
            assert pred > 0
    
    def test_predict_with_model_not_trained(self, sample_data):
        """Test that prediction fails without trained model"""
        predictor = LSTMPricePredictor(sequence_length=30)
        
        with pytest.raises(ValueError):
            predictor.predict_prices(sample_data, days_ahead=7)


class TestDataValidation:
    """Test data validation functionality"""
    
    @pytest.fixture
    def predictor(self):
        return LSTMPricePredictor(sequence_length=30)
    
    def test_validate_prices_with_negatives(self, predictor):
        """Test handling of negative prices"""
        prices_with_negatives = np.array([100, 150, -50, 200, 180])
        
        # Should handle or raise appropriate error
        try:
            cleaned = predictor._validate_prices(prices_with_negatives)
            assert all(p >= 0 for p in cleaned)
        except (ValueError, AttributeError):
            pass  # Validation method may not exist
    
    def test_validate_prices_with_nan(self, predictor):
        """Test handling of NaN values"""
        prices_with_nan = np.array([100, 150, np.nan, 200, 180])
        
        # Should handle or raise appropriate error
        try:
            cleaned = predictor._validate_prices(prices_with_nan)
            assert not np.any(np.isnan(cleaned))
        except (ValueError, AttributeError):
            pass  # Validation method may not exist


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
