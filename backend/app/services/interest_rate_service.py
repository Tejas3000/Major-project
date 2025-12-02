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
        Calculate the current variable interest rate for a cryptocurrency
        using ML-based price predictions and volatility analysis.
        
        The rate is composed of:
        1. Base Rate: Minimum interest rate
        2. Volatility Premium: Based on predicted price volatility from LSTM model
        3. Utilization Factor: Based on supply/demand in the pool
        4. Risk Adjustment: Based on ML predictions and market conditions
        
        Args:
            crypto_id: Cryptocurrency identifier
            
        Returns:
            Dictionary with interest rate breakdown
        """
        try:
            # Get ML-based prediction and volatility metrics
            prediction = await self.prediction_service.get_prediction(crypto_id)
            volatility = await self.market_service.calculate_volatility(crypto_id)
            
            # Get volatility prediction from ML model
            ml_volatility = await self.prediction_service.get_volatility_prediction(crypto_id)
            
            logger.info(f"Calculating interest rate for {crypto_id}")
            logger.info(f"ML Prediction: trend={prediction.get('trend')}, "
                       f"confidence={prediction.get('confidence_score', 0):.2%}, "
                       f"model={prediction.get('model_version', 'unknown')}")
            
            # Calculate components using ML predictions
            volatility_premium = self._calculate_volatility_premium(volatility, prediction, ml_volatility)
            utilization_factor = self._calculate_utilization_factor(crypto_id)
            risk_adjustment = self._calculate_risk_adjustment(prediction, volatility, ml_volatility)
            
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
                    "predicted_volatility": ml_volatility.get("predicted_volatility", 0),
                    "predicted_trend": prediction.get("trend", "neutral"),
                    "predicted_change": prediction.get("predicted_change_percent", 0),
                    "confidence_score": prediction.get("confidence_score", 0),
                    "volatility_regime": volatility.get("volatility_regime", "medium"),
                    "risk_level": ml_volatility.get("risk_level", "medium"),
                    "model_version": prediction.get("model_version", "unknown"),
                    "data_source": prediction.get("data_source", "unknown")
                }
            }
            
        except Exception as e:
            logger.error(f"Error calculating interest rate: {e}")
            import traceback
            traceback.print_exc()
            return self._get_fallback_rate(crypto_id)
    
    def _calculate_volatility_premium(self, volatility: Dict, prediction: Dict, ml_volatility: Dict = None) -> float:
        """
        Calculate interest rate premium based on volatility from ML model.
        
        Higher volatility = Higher premium (more risk for lenders)
        Uses both historical and ML-predicted volatility for more accurate assessment.
        """
        # Historical volatility
        annualized_vol = volatility.get("annualized_volatility", 0.5)
        
        # ML-predicted volatility (if available)
        if ml_volatility:
            predicted_vol = ml_volatility.get("predicted_volatility", 0.03)
            # Weight ML prediction more if confidence is high
            confidence = prediction.get("confidence_score", 0.5)
            # Blend historical and predicted volatility
            effective_vol = annualized_vol * (1 - confidence * 0.5) + predicted_vol * (confidence * 0.5)
        else:
            effective_vol = annualized_vol
        
        # Base volatility premium
        vol_premium = effective_vol * 0.12  # 12% of effective volatility
        
        # Adjust based on prediction confidence
        # Low confidence = higher uncertainty = higher premium
        confidence = prediction.get("confidence_score", 0.5)
        uncertainty_factor = (1 - confidence) * 0.025
        
        # Check volatility regime
        regime = volatility.get("volatility_regime", "medium")
        regime_multipliers = {
            "low": 0.6,
            "medium": 1.0,
            "high": 1.4,
            "extreme": 2.0
        }
        
        # Also consider ML-based risk level
        if ml_volatility:
            risk_level = ml_volatility.get("risk_level", "medium")
            risk_multipliers = {
                "low": 0.8,
                "medium": 1.0,
                "high": 1.3,
                "very_high": 1.6
            }
            risk_mult = risk_multipliers.get(risk_level, 1.0)
        else:
            risk_mult = 1.0
        
        vol_premium *= regime_multipliers.get(regime, 1.0) * risk_mult
        
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
    
    def _calculate_risk_adjustment(self, prediction: Dict, volatility: Dict, ml_volatility: Dict = None) -> float:
        """
        Calculate risk adjustment based on ML predictions and market conditions.
        
        Uses the trained LSTM model's predictions to dynamically adjust rates.
        """
        trend = prediction.get("trend", "neutral")
        predicted_change = prediction.get("predicted_change_percent", 0)
        max_drawdown = volatility.get("max_drawdown", 0.1)
        confidence = prediction.get("confidence_score", 0.5)
        
        # Base risk adjustment
        risk_adj = 0.0
        
        # Bearish market = higher rates (more risk for collateral)
        # But only apply if model is confident
        if trend == "bearish" and confidence > 0.6:
            # Scale based on predicted decline magnitude and confidence
            decline_severity = abs(predicted_change) / 100  # Normalize to 0-1 range
            confidence_weight = min(confidence, 0.95)  # Cap at 95%
            
            # Calculate bearish premium
            bearish_premium = min(decline_severity * confidence_weight * 0.4, 0.08)
            risk_adj += bearish_premium
            
            logger.debug(f"Bearish adjustment: {bearish_premium:.4f} "
                        f"(change={predicted_change:.2f}%, confidence={confidence:.2%})")
        
        # Bullish market with high confidence = slightly lower rates
        elif trend == "bullish" and confidence > 0.7 and predicted_change > 5:
            bullish_discount = min(predicted_change / 100 * confidence * 0.1, 0.02)
            risk_adj -= bullish_discount
        
        # Drawdown risk premium
        if max_drawdown > 0.25:
            risk_adj += 0.03
        elif max_drawdown > 0.15:
            risk_adj += 0.02
        elif max_drawdown > 0.10:
            risk_adj += 0.01
        
        # High volatility in predictions = additional uncertainty premium
        if ml_volatility:
            trend_strength = ml_volatility.get("trend_strength", 0)
            if trend_strength > 15:  # Large predicted moves
                risk_adj += 0.015
        
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
