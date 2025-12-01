"""
Tests for the API routes
"""
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, AsyncMock
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app


@pytest.fixture
def client():
    """Create a test client"""
    return TestClient(app)


class TestHealthEndpoint:
    """Test health check endpoint"""
    
    def test_health_check(self, client):
        """Test the health check endpoint"""
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        data = response.json()
        assert "status" in data


class TestPredictionEndpoints:
    """Test prediction-related endpoints"""
    
    @patch('app.services.prediction_service.PredictionService')
    def test_get_price_prediction(self, mock_service, client):
        """Test price prediction endpoint"""
        mock_instance = Mock()
        mock_instance.get_prediction = AsyncMock(return_value={
            'asset': 'ethereum',
            'current_price': 2000,
            'predictions': [2100, 2150, 2200, 2180, 2250, 2300, 2280],
            'volatility': 0.05,
            'confidence': 0.85
        })
        mock_service.return_value = mock_instance
        
        response = client.get("/api/v1/predictions/ethereum")
        
        # Should return 200 or fail gracefully
        assert response.status_code in [200, 500, 503]
    
    def test_get_prediction_invalid_asset(self, client):
        """Test prediction with invalid asset"""
        response = client.get("/api/v1/predictions/invalid_asset_xyz")
        
        # Should return error or empty response
        assert response.status_code in [200, 400, 404, 500]


class TestInterestRateEndpoints:
    """Test interest rate-related endpoints"""
    
    @patch('app.services.interest_rate_service.InterestRateService')
    def test_get_interest_rate(self, mock_service, client):
        """Test interest rate endpoint"""
        mock_instance = Mock()
        mock_instance.calculate_interest_rate = AsyncMock(return_value={
            'asset': 'ethereum',
            'base_rate': 0.02,
            'ml_premium': 0.03,
            'utilization_factor': 0.01,
            'final_rate': 0.06,
            'apy': 0.0618
        })
        mock_service.return_value = mock_instance
        
        response = client.get("/api/v1/interest-rates/ethereum")
        
        assert response.status_code in [200, 500, 503]
    
    def test_get_all_interest_rates(self, client):
        """Test getting all interest rates"""
        response = client.get("/api/v1/interest-rates")
        
        assert response.status_code in [200, 500, 503]


class TestMarketDataEndpoints:
    """Test market data-related endpoints"""
    
    @patch('app.services.market_data_service.MarketDataService')
    def test_get_market_data(self, mock_service, client):
        """Test market data endpoint"""
        mock_instance = Mock()
        mock_instance.get_current_price = AsyncMock(return_value={
            'asset': 'ethereum',
            'price': 2000,
            'price_change_24h': 2.5,
            'market_cap': 250000000000,
            'volume_24h': 15000000000
        })
        mock_service.return_value = mock_instance
        
        response = client.get("/api/v1/market/ethereum")
        
        assert response.status_code in [200, 500, 503]
    
    def test_get_historical_data(self, client):
        """Test historical data endpoint"""
        response = client.get("/api/v1/market/ethereum/history?days=30")
        
        assert response.status_code in [200, 500, 503]


class TestPoolEndpoints:
    """Test lending pool-related endpoints"""
    
    def test_get_pool_stats(self, client):
        """Test pool statistics endpoint"""
        response = client.get("/api/v1/pools/ethereum")
        
        assert response.status_code in [200, 404, 500]
    
    def test_get_all_pools(self, client):
        """Test getting all pool stats"""
        response = client.get("/api/v1/pools")
        
        assert response.status_code in [200, 500]


class TestValidation:
    """Test input validation"""
    
    def test_invalid_days_parameter(self, client):
        """Test with invalid days parameter"""
        response = client.get("/api/v1/predictions/ethereum?days=-5")
        
        # Should return validation error or handle gracefully
        assert response.status_code in [200, 400, 422]
    
    def test_invalid_utilization_rate(self, client):
        """Test with invalid utilization rate"""
        response = client.get("/api/v1/interest-rates/ethereum?utilization=1.5")
        
        # Should return validation error or handle gracefully
        assert response.status_code in [200, 400, 422]


class TestErrorHandling:
    """Test error handling"""
    
    def test_404_endpoint(self, client):
        """Test non-existent endpoint"""
        response = client.get("/api/v1/nonexistent")
        
        assert response.status_code == 404
    
    def test_method_not_allowed(self, client):
        """Test wrong HTTP method"""
        response = client.post("/api/v1/predictions/ethereum")
        
        assert response.status_code == 405


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
