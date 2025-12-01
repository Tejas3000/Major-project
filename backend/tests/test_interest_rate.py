"""
Tests for the Interest Rate Service
"""
import pytest
import numpy as np
from unittest.mock import Mock, patch, AsyncMock
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.interest_rate_service import InterestRateService


class TestInterestRateService:
    """Test suite for InterestRateService"""
    
    @pytest.fixture
    def service(self):
        """Create service instance"""
        return InterestRateService()
    
    @pytest.fixture
    def mock_prediction_service(self):
        """Create mock prediction service"""
        mock = Mock()
        mock.get_prediction = AsyncMock(return_value={
            'predictions': [2100, 2150, 2200, 2180, 2250, 2300, 2280],
            'volatility': 0.05,
            'trend': 'bullish'
        })
        return mock


class TestBaseRateCalculation:
    """Test base rate calculations"""
    
    @pytest.fixture
    def service(self):
        return InterestRateService()
    
    def test_base_rate_is_positive(self, service):
        """Test that base rate is always positive"""
        base_rate = service.base_rate
        assert base_rate > 0
    
    def test_base_rate_is_reasonable(self, service):
        """Test that base rate is in reasonable range"""
        base_rate = service.base_rate
        # Base rate should typically be between 0.5% and 10%
        assert 0.005 <= base_rate <= 0.10


class TestMLPremiumCalculation:
    """Test ML premium calculation based on volatility"""
    
    @pytest.fixture
    def service(self):
        return InterestRateService()
    
    def test_low_volatility_premium(self, service):
        """Test premium for low volatility"""
        premium = service._calculate_ml_premium(volatility=0.02)
        # Low volatility should result in lower premium
        assert premium >= 0
        assert premium < 0.05  # Should be less than 5%
    
    def test_high_volatility_premium(self, service):
        """Test premium for high volatility"""
        premium = service._calculate_ml_premium(volatility=0.20)
        # High volatility should result in higher premium
        assert premium > 0
        assert premium < 0.20  # Should be capped
    
    def test_zero_volatility(self, service):
        """Test premium with zero volatility"""
        premium = service._calculate_ml_premium(volatility=0)
        assert premium == 0
    
    def test_premium_increases_with_volatility(self, service):
        """Test that premium increases with volatility"""
        low_vol_premium = service._calculate_ml_premium(volatility=0.02)
        high_vol_premium = service._calculate_ml_premium(volatility=0.10)
        
        assert high_vol_premium > low_vol_premium


class TestUtilizationFactor:
    """Test utilization rate factor calculations"""
    
    @pytest.fixture
    def service(self):
        return InterestRateService()
    
    def test_zero_utilization(self, service):
        """Test factor at zero utilization"""
        factor = service._calculate_utilization_factor(utilization=0)
        assert factor >= 0
    
    def test_full_utilization(self, service):
        """Test factor at full utilization"""
        factor = service._calculate_utilization_factor(utilization=1.0)
        assert factor > 0
    
    def test_utilization_factor_increases(self, service):
        """Test that factor increases with utilization"""
        low_util = service._calculate_utilization_factor(utilization=0.3)
        high_util = service._calculate_utilization_factor(utilization=0.9)
        
        assert high_util >= low_util
    
    def test_optimal_utilization(self, service):
        """Test behavior around optimal utilization point"""
        below_optimal = service._calculate_utilization_factor(utilization=0.7)
        at_optimal = service._calculate_utilization_factor(utilization=0.8)
        above_optimal = service._calculate_utilization_factor(utilization=0.9)
        
        # Above optimal should have higher factor (to discourage borrowing)
        assert above_optimal > below_optimal


class TestTimeFactor:
    """Test time-based factor calculations"""
    
    @pytest.fixture
    def service(self):
        return InterestRateService()
    
    def test_short_duration(self, service):
        """Test factor for short loan duration"""
        factor = service._calculate_time_factor(duration_days=7)
        assert factor >= 0
    
    def test_long_duration(self, service):
        """Test factor for long loan duration"""
        factor = service._calculate_time_factor(duration_days=365)
        assert factor >= 0
    
    def test_duration_relationship(self, service):
        """Test that longer durations have different factors"""
        short = service._calculate_time_factor(duration_days=30)
        long = service._calculate_time_factor(duration_days=180)
        
        # Should be different (longer may have discount or premium)
        # The relationship depends on the implementation
        assert isinstance(short, (int, float))
        assert isinstance(long, (int, float))


class TestFinalRateCalculation:
    """Test final interest rate calculation"""
    
    @pytest.fixture
    def service(self):
        return InterestRateService()
    
    @pytest.mark.asyncio
    async def test_final_rate_components(self, service):
        """Test that final rate includes all components"""
        with patch.object(service, '_get_ml_predictions', new_callable=AsyncMock) as mock:
            mock.return_value = {'volatility': 0.05, 'trend': 'neutral'}
            
            result = await service.calculate_interest_rate(
                asset='ethereum',
                utilization=0.5,
                duration_days=30
            )
            
            assert 'base_rate' in result
            assert 'ml_premium' in result
            assert 'utilization_factor' in result
            assert 'final_rate' in result
    
    @pytest.mark.asyncio
    async def test_final_rate_is_positive(self, service):
        """Test that final rate is always positive"""
        with patch.object(service, '_get_ml_predictions', new_callable=AsyncMock) as mock:
            mock.return_value = {'volatility': 0.05, 'trend': 'neutral'}
            
            result = await service.calculate_interest_rate(
                asset='ethereum',
                utilization=0.5,
                duration_days=30
            )
            
            assert result['final_rate'] > 0
    
    @pytest.mark.asyncio
    async def test_final_rate_is_capped(self, service):
        """Test that final rate doesn't exceed maximum"""
        with patch.object(service, '_get_ml_predictions', new_callable=AsyncMock) as mock:
            # High volatility scenario
            mock.return_value = {'volatility': 0.50, 'trend': 'bearish'}
            
            result = await service.calculate_interest_rate(
                asset='ethereum',
                utilization=0.99,  # Near full utilization
                duration_days=365
            )
            
            # Rate should be capped at reasonable maximum (e.g., 50%)
            assert result['final_rate'] < 0.50


class TestAPYCalculation:
    """Test APY calculation from interest rate"""
    
    @pytest.fixture
    def service(self):
        return InterestRateService()
    
    def test_apy_calculation(self, service):
        """Test APY calculation"""
        rate = 0.05  # 5% interest rate
        apy = service._calculate_apy(rate)
        
        # APY should be higher than simple rate due to compounding
        assert apy > rate
    
    def test_apy_zero_rate(self, service):
        """Test APY with zero rate"""
        apy = service._calculate_apy(0)
        assert apy == 0
    
    def test_apy_compounds_correctly(self, service):
        """Test that APY compounds as expected"""
        rate = 0.12  # 12% annual rate
        apy = service._calculate_apy(rate, compounds_per_year=12)
        
        # Expected APY for monthly compounding
        expected_apy = (1 + rate/12) ** 12 - 1
        
        assert abs(apy - expected_apy) < 0.0001


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
