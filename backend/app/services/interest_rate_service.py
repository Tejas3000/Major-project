"""
Interest Rate Service

Calculates variable interest rates for borrowers based on:
- ML price predictions and volatility
- Market conditions
- Pool utilization
- Risk factors
"""
from datetime import datetime, timedelta
from typing import Dict, Optional, List
from loguru import logger
import numpy as np

from app.config import settings
from app.services.prediction_service import PredictionService
from app.services.market_data_service import MarketDataService


class InterestRateService:
    """Service for calculating dynamic interest rates"""
    
    def __init__(self):
        self.prediction_service = PredictionService()
        self.market_service = MarketDataService()
        
        # Interest rate parameters
        self.base_rate = settings.BASE_INTEREST_RATE
        self.max_rate = settings.MAX_INTEREST_RATE
        self.min_rate = settings.MIN_INTEREST_RATE
        
        # Mock pool data (replace with blockchain reads in production)
        self.pool_data = {
            "ethereum": {
                "total_supplied": 10000.0,
                "total_borrowed": 6500.0,
                "reserve_factor": 0.1
            }
        }
        
        # Mock user positions (replace with blockchain reads)
        self.user_positions = {}
    
    async def calculate_interest_rate(self, crypto_id: str = "ethereum") -> Dict:
        """
        Calculate the current variable interest rate for a cryptocurrency.
        
        The rate is composed of:
        1. Base Rate: Minimum interest rate
        2. Volatility Premium: Based on predicted price volatility
        3. Utilization Factor: Based on supply/demand in the pool
        4. Risk Adjustment: Based on market conditions
        
        Args:
            crypto_id: Cryptocurrency identifier
            
        Returns:
            Dictionary with interest rate breakdown
        """
        try:
            # Get prediction and volatility metrics
            prediction = await self.prediction_service.get_prediction(crypto_id)
            volatility = await self.market_service.calculate_volatility(crypto_id)
            
            # Calculate components
            volatility_premium = self._calculate_volatility_premium(volatility, prediction)
            utilization_factor = self._calculate_utilization_factor(crypto_id)
            risk_adjustment = self._calculate_risk_adjustment(prediction, volatility)
            
            # Calculate effective rate
            effective_rate = (
                self.base_rate +
                volatility_premium +
                utilization_factor +
                risk_adjustment
            )
            
            # Clamp to min/max bounds
            effective_rate = max(self.min_rate, min(self.max_rate, effective_rate))
            
            # Calculate next update time (rates update hourly)
            next_update = datetime.now().replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            
            return {
                "cryptocurrency": crypto_id,
                "current_rate": effective_rate,
                "base_rate": self.base_rate,
                "volatility_premium": volatility_premium,
                "utilization_factor": utilization_factor,
                "risk_adjustment": risk_adjustment,
                "effective_rate": effective_rate,
                "apy": self._calculate_apy(effective_rate),
                "next_update": next_update.isoformat(),
                "rate_components": {
                    "market_volatility": volatility.get("annualized_volatility", 0),
                    "predicted_trend": prediction.get("trend", "neutral"),
                    "confidence_score": prediction.get("confidence_score", 0),
                    "volatility_regime": volatility.get("volatility_regime", "medium")
                }
            }
            
        except Exception as e:
            logger.error(f"Error calculating interest rate: {e}")
            return self._get_fallback_rate(crypto_id)
    
    def _calculate_volatility_premium(self, volatility: Dict, prediction: Dict) -> float:
        """
        Calculate interest rate premium based on volatility.
        
        Higher volatility = Higher premium (more risk for lenders)
        """
        annualized_vol = volatility.get("annualized_volatility", 0.5)
        confidence = prediction.get("confidence_score", 0.5)
        
        # Base volatility premium
        vol_premium = annualized_vol * 0.1  # 10% of annualized volatility
        
        # Adjust based on prediction confidence
        # Low confidence = higher uncertainty = higher premium
        uncertainty_factor = (1 - confidence) * 0.02
        
        # Check volatility regime
        regime = volatility.get("volatility_regime", "medium")
        regime_multipliers = {
            "low": 0.5,
            "medium": 1.0,
            "high": 1.5,
            "extreme": 2.0
        }
        
        vol_premium *= regime_multipliers.get(regime, 1.0)
        
        return vol_premium + uncertainty_factor
    
    def _calculate_utilization_factor(self, crypto_id: str) -> float:
        """
        Calculate interest rate factor based on pool utilization.
        
        Formula: Uses a kinked rate model similar to Compound/Aave
        - Below optimal utilization: gentle slope
        - Above optimal utilization: steep slope (encourages repayment)
        """
        pool = self.pool_data.get(crypto_id, {
            "total_supplied": 10000,
            "total_borrowed": 5000
        })
        
        total_supplied = pool.get("total_supplied", 10000)
        total_borrowed = pool.get("total_borrowed", 5000)
        
        if total_supplied == 0:
            return 0
        
        utilization = total_borrowed / total_supplied
        
        # Optimal utilization target
        optimal_utilization = 0.80
        
        if utilization <= optimal_utilization:
            # Gentle slope below optimal
            factor = utilization * 0.05
        else:
            # Steep slope above optimal (jump rate model)
            base_factor = optimal_utilization * 0.05
            excess = utilization - optimal_utilization
            jump_factor = excess * 0.5  # 50% slope above optimal
            factor = base_factor + jump_factor
        
        return factor
    
    def _calculate_risk_adjustment(self, prediction: Dict, volatility: Dict) -> float:
        """
        Calculate risk adjustment based on market conditions.
        """
        trend = prediction.get("trend", "neutral")
        predicted_change = prediction.get("predicted_change_percent", 0)
        max_drawdown = volatility.get("max_drawdown", 0.1)
        
        # Base risk adjustment
        risk_adj = 0.0
        
        # Bearish market = higher rates (more risk)
        if trend == "bearish":
            # Scale based on predicted decline
            decline_factor = min(abs(predicted_change) / 100, 0.1) * 0.3
            risk_adj += decline_factor
        
        # Drawdown risk premium
        if max_drawdown > 0.2:
            risk_adj += 0.02
        elif max_drawdown > 0.1:
            risk_adj += 0.01
        
        return risk_adj
    
    def _calculate_apy(self, rate: float) -> float:
        """Convert periodic rate to APY with compounding"""
        # Assume daily compounding
        compounds_per_year = 365
        apy = (1 + rate / compounds_per_year) ** compounds_per_year - 1
        return apy
    
    async def calculate_borrow_rate(
        self,
        crypto_id: str,
        amount: float,
        collateral_amount: float,
        collateral_type: str
    ) -> Dict:
        """
        Calculate personalized borrow rate based on loan parameters.
        
        Args:
            crypto_id: Cryptocurrency to borrow
            amount: Amount to borrow
            collateral_amount: Collateral amount
            collateral_type: Type of collateral
            
        Returns:
            Dictionary with borrow rate details
        """
        # Get base interest rate
        base_rate_info = await self.calculate_interest_rate(crypto_id)
        base_rate = base_rate_info["effective_rate"]
        
        # Calculate collateral ratio
        # Get collateral price
        collateral_price_data = await self.market_service.get_market_data(collateral_type)
        borrow_price_data = await self.market_service.get_market_data(crypto_id)
        
        collateral_value = collateral_amount * collateral_price_data["current_price"]
        borrow_value = amount * borrow_price_data["current_price"]
        
        collateral_ratio = collateral_value / borrow_value if borrow_value > 0 else 0
        
        # Risk adjustment based on collateral ratio
        if collateral_ratio >= 2.0:
            # Well-collateralized - discount
            rate_adjustment = -0.005
        elif collateral_ratio >= 1.5:
            # Standard collateralization
            rate_adjustment = 0
        elif collateral_ratio >= 1.25:
            # Risky - premium
            rate_adjustment = 0.02
        else:
            # Very risky
            rate_adjustment = 0.05
        
        final_rate = max(self.min_rate, min(self.max_rate, base_rate + rate_adjustment))
        
        return {
            "base_rate": base_rate,
            "rate_adjustment": rate_adjustment,
            "final_rate": final_rate,
            "apy": self._calculate_apy(final_rate),
            "collateral_ratio": collateral_ratio,
            "health_factor": self._calculate_loan_health_factor(collateral_ratio),
            "liquidation_threshold": 1.15
        }
    
    def _calculate_loan_health_factor(self, collateral_ratio: float) -> float:
        """Calculate health factor for a loan"""
        liquidation_threshold = 1.15
        return collateral_ratio / liquidation_threshold
    
    async def get_pool_stats(self, crypto_id: str) -> Dict:
        """Get lending pool statistics"""
        pool = self.pool_data.get(crypto_id, {
            "total_supplied": 10000,
            "total_borrowed": 5000
        })
        
        total_supplied = pool.get("total_supplied", 10000)
        total_borrowed = pool.get("total_borrowed", 5000)
        
        utilization = total_borrowed / total_supplied if total_supplied > 0 else 0
        
        rate_info = await self.calculate_interest_rate(crypto_id)
        
        return {
            "total_supplied": total_supplied,
            "total_borrowed": total_borrowed,
            "utilization_rate": utilization,
            "available_liquidity": total_supplied - total_borrowed,
            "current_interest_rate": rate_info["effective_rate"],
            "supply_apy": rate_info["apy"] * (1 - pool.get("reserve_factor", 0.1)),
            "borrow_apy": rate_info["apy"]
        }
    
    async def get_rate_history(self, crypto_id: str, days: int) -> List[Dict]:
        """Get historical interest rates (mock data for now)"""
        history = []
        base_rate = self.base_rate
        
        for i in range(days, 0, -1):
            date = datetime.now() - timedelta(days=i)
            
            # Simulate rate variations
            variation = np.random.normal(0, 0.002)
            rate = max(self.min_rate, min(self.max_rate, base_rate + variation))
            
            history.append({
                "date": date.strftime("%Y-%m-%d"),
                "rate": rate,
                "apy": self._calculate_apy(rate)
            })
            
            base_rate = rate  # Random walk
        
        return history
    
    async def prepare_supply_transaction(
        self,
        wallet_address: str,
        crypto_id: str,
        amount: float
    ) -> Dict:
        """
        Prepare transaction data for supplying assets to the pool.
        
        Returns data needed by frontend to construct MetaMask transaction.
        """
        pool_stats = await self.get_pool_stats(crypto_id)
        
        return {
            "function": "supply",
            "contract_address": settings.LENDING_POOL_ADDRESS,
            "amount": amount,
            "expected_apy": pool_stats["supply_apy"],
            "estimated_gas": 150000,
            "wallet_address": wallet_address
        }
    
    async def prepare_borrow_transaction(
        self,
        wallet_address: str,
        crypto_id: str,
        amount: float,
        collateral_amount: float,
        collateral_type: str
    ) -> Dict:
        """
        Prepare transaction data for borrowing from the pool.
        """
        borrow_rate = await self.calculate_borrow_rate(
            crypto_id, amount, collateral_amount, collateral_type
        )
        
        return {
            "function": "borrow",
            "contract_address": settings.LENDING_POOL_ADDRESS,
            "amount": amount,
            "collateral_amount": collateral_amount,
            "collateral_type": collateral_type,
            "interest_rate": borrow_rate["final_rate"],
            "health_factor": borrow_rate["health_factor"],
            "estimated_gas": 250000,
            "wallet_address": wallet_address
        }
    
    async def get_user_positions(self, wallet_address: str) -> Dict:
        """Get user's lending and borrowing positions"""
        # Mock data - in production, read from blockchain
        return {
            "wallet_address": wallet_address,
            "supplied": [
                {"asset": "ethereum", "amount": 5.0, "value_usd": 11250.0, "apy": 0.045}
            ],
            "borrowed": [
                {"asset": "ethereum", "amount": 2.0, "value_usd": 4500.0, "rate": 0.08}
            ],
            "total_supplied_usd": 11250.0,
            "total_borrowed_usd": 4500.0,
            "net_worth": 6750.0
        }
    
    async def calculate_health_factor(self, wallet_address: str) -> Dict:
        """Calculate user's overall health factor"""
        positions = await self.get_user_positions(wallet_address)
        
        total_collateral = positions["total_supplied_usd"]
        total_debt = positions["total_borrowed_usd"]
        
        if total_debt == 0:
            health_factor = float('inf')
            status = "no_debt"
        else:
            health_factor = (total_collateral * 0.85) / total_debt  # 85% liquidation threshold
            
            if health_factor > 2:
                status = "healthy"
            elif health_factor > 1.5:
                status = "moderate"
            elif health_factor > 1.1:
                status = "at_risk"
            else:
                status = "danger"
        
        return {
            "wallet_address": wallet_address,
            "health_factor": health_factor if health_factor != float('inf') else 999,
            "status": status,
            "total_collateral_usd": total_collateral,
            "total_debt_usd": total_debt,
            "liquidation_threshold": 0.85
        }
    
    def _get_fallback_rate(self, crypto_id: str) -> Dict:
        """Return fallback rate when calculation fails"""
        return {
            "cryptocurrency": crypto_id,
            "current_rate": self.base_rate + 0.03,
            "base_rate": self.base_rate,
            "volatility_premium": 0.02,
            "utilization_factor": 0.01,
            "risk_adjustment": 0.0,
            "effective_rate": self.base_rate + 0.03,
            "apy": self._calculate_apy(self.base_rate + 0.03),
            "next_update": (datetime.now() + timedelta(hours=1)).isoformat()
        }


# Singleton instance
interest_service = InterestRateService()
