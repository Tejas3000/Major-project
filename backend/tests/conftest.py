"""
Test configuration and fixtures
"""
import pytest
import sys
import os

# Add the backend directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


@pytest.fixture(scope="session")
def test_config():
    """Test configuration"""
    return {
        'sequence_length': 30,
        'prediction_days': 7,
        'base_rate': 0.02,
        'max_rate': 0.25,
    }


@pytest.fixture
def mock_price_data():
    """Generate mock price data for testing"""
    import numpy as np
    
    np.random.seed(42)
    
    # Generate realistic-looking price data
    n_days = 100
    base_price = 2000
    returns = np.random.normal(0.001, 0.02, n_days)  # Mean 0.1%, std 2%
    prices = base_price * np.exp(np.cumsum(returns))
    
    return prices.tolist()


@pytest.fixture
def mock_market_response():
    """Mock market data API response"""
    return {
        'id': 'ethereum',
        'symbol': 'eth',
        'name': 'Ethereum',
        'current_price': 2000,
        'market_cap': 250000000000,
        'market_cap_rank': 2,
        'total_volume': 15000000000,
        'price_change_24h': 50,
        'price_change_percentage_24h': 2.5,
        'circulating_supply': 120000000,
    }


@pytest.fixture
def mock_prediction_response():
    """Mock prediction service response"""
    return {
        'asset': 'ethereum',
        'current_price': 2000,
        'predictions': [2050, 2100, 2080, 2120, 2150, 2130, 2160],
        'volatility': 0.045,
        'confidence': 0.85,
        'trend': 'bullish',
        'timestamp': '2024-01-15T12:00:00Z'
    }


@pytest.fixture
def mock_interest_rate_response():
    """Mock interest rate service response"""
    return {
        'asset': 'ethereum',
        'base_rate': 0.02,
        'ml_premium': 0.023,
        'utilization_factor': 0.015,
        'time_factor': 0.0,
        'final_rate': 0.058,
        'apy': 0.0597,
        'components': {
            'volatility': 0.045,
            'trend': 'bullish',
            'utilization': 0.65
        }
    }
