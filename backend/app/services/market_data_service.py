"""
Market Data Service

Fetches real-time and historical cryptocurrency/stock market data using yfinance.
"""
import aiohttp
import pandas as pd
import numpy as np
import yfinance as yf
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from loguru import logger
import asyncio
from concurrent.futures import ThreadPoolExecutor

from app.config import settings

# Thread pool for running yfinance synchronous calls
_executor = ThreadPoolExecutor(max_workers=4)


class MarketDataService:
    """Service for fetching cryptocurrency/stock market data using yfinance"""
    
    # Mapping of common names to yfinance ticker symbols
    TICKER_MAP = {
        # Cryptocurrencies
        "ethereum": "ETH-USD",
        "bitcoin": "BTC-USD",
        "chainlink": "LINK-USD",
        "uniswap": "UNI-USD",
        "solana": "SOL-USD",
        "cardano": "ADA-USD",
        "dogecoin": "DOGE-USD",
        "avalanche": "AVAX-USD",
        "polkadot": "DOT-USD",
        # Stocks
        "apple": "AAPL",
        "google": "GOOGL",
        "microsoft": "MSFT",
        "amazon": "AMZN",
        "tesla": "TSLA",
        "nvidia": "NVDA",
        "meta": "META",
    }
    
    def __init__(self):
        self.base_url = settings.COINGECKO_API_URL
        self.cache = {}
        self.cache_duration = timedelta(minutes=5)
    
    def _get_ticker_symbol(self, asset_id: str) -> str:
        """Convert asset name to yfinance ticker symbol"""
        asset_lower = asset_id.lower()
        if asset_lower in self.TICKER_MAP:
            return self.TICKER_MAP[asset_lower]
        # If already a valid ticker symbol (e.g., "AAPL", "BTC-USD")
        return asset_id.upper()
    
    def _fetch_yfinance_data(self, ticker: str, period: str = "1d", interval: str = "1m") -> pd.DataFrame:
        """Synchronous yfinance data fetch (to be run in thread pool)"""
        try:
            stock = yf.Ticker(ticker)
            data = stock.history(period=period, interval=interval)
            return data
        except Exception as e:
            logger.error(f"yfinance error for {ticker}: {e}")
            return pd.DataFrame()
    
    def _fetch_yfinance_info(self, ticker: str) -> Dict:
        """Synchronous yfinance info fetch (to be run in thread pool)"""
        try:
            stock = yf.Ticker(ticker)
            return stock.info
        except Exception as e:
            logger.error(f"yfinance info error for {ticker}: {e}")
            return {}
    
    async def _fetch(self, endpoint: str, params: Dict = None) -> Dict:
        """Make async HTTP request to CoinGecko API (fallback)"""
        url = f"{self.base_url}/{endpoint}"
        
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        logger.error(f"API request failed: {response.status}")
                        raise Exception(f"API request failed with status {response.status}")
            except Exception as e:
                logger.error(f"Error fetching data: {e}")
                raise
    
    async def get_market_data(self, asset_id: str = "ethereum") -> Dict:
        """
        Get current market data for a cryptocurrency or stock using yfinance.
        
        Args:
            asset_id: Asset name or ticker symbol (e.g., 'ethereum', 'bitcoin', 'AAPL')
            
        Returns:
            Dictionary with current market data
        """
        cache_key = f"market_{asset_id}"
        
        # Check cache
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if datetime.now() - cached_time < self.cache_duration:
                return cached_data
        
        try:
            ticker = self._get_ticker_symbol(asset_id)
            logger.info(f"Fetching market data for {asset_id} (ticker: {ticker})")
            
            # Run yfinance in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            info = await loop.run_in_executor(_executor, self._fetch_yfinance_info, ticker)
            hist = await loop.run_in_executor(
                _executor, 
                lambda: self._fetch_yfinance_data(ticker, period="5d", interval="1d")
            )
            
            if not info or hist.empty:
                logger.warning(f"No data from yfinance for {ticker}, using mock data")
                return self._get_mock_market_data(asset_id)
            
            # Get current price from latest historical data
            current_price = float(hist['Close'].iloc[-1]) if not hist.empty else info.get('regularMarketPrice', 0)
            prev_close = float(hist['Close'].iloc[-2]) if len(hist) > 1 else current_price
            
            # Calculate price changes
            price_change_24h = ((current_price - prev_close) / prev_close * 100) if prev_close else 0
            
            # Get 7-day change if we have enough data
            if len(hist) >= 5:
                price_7d_ago = float(hist['Close'].iloc[0])
                price_change_7d = ((current_price - price_7d_ago) / price_7d_ago * 100)
            else:
                price_change_7d = price_change_24h
            
            result = {
                "asset": asset_id,
                "ticker": ticker,
                "name": info.get('shortName', info.get('longName', asset_id)),
                "current_price": current_price,
                "previous_close": prev_close,
                "price_change_24h": round(price_change_24h, 2),
                "price_change_7d": round(price_change_7d, 2),
                "market_cap": info.get('marketCap', 0),
                "volume_24h": info.get('volume', info.get('regularMarketVolume', 0)),
                "high_24h": info.get('dayHigh', info.get('regularMarketDayHigh', current_price)),
                "low_24h": info.get('dayLow', info.get('regularMarketDayLow', current_price)),
                "open_price": info.get('open', info.get('regularMarketOpen', current_price)),
                "currency": info.get('currency', 'USD'),
                "exchange": info.get('exchange', 'Unknown'),
                "last_updated": datetime.now().isoformat(),
                "source": "yfinance"
            }
            
            # Cache the result
            self.cache[cache_key] = (result, datetime.now())
            logger.info(f"Successfully fetched {asset_id}: ${current_price:.2f}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching market data for {asset_id}: {e}")
            # Return mock data for development
            return self._get_mock_market_data(asset_id)
    
    async def get_price_history(
        self,
        asset_id: str = "ethereum",
        days: int = 30
    ) -> List[Dict]:
        """
        Get historical price data using yfinance.
        
        Args:
            asset_id: Asset name or ticker symbol
            days: Number of days of history
            
        Returns:
            List of dictionaries with price history
        """
        cache_key = f"history_{asset_id}_{days}"
        
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if datetime.now() - cached_time < self.cache_duration:
                return cached_data
        
        try:
            ticker = self._get_ticker_symbol(asset_id)
            logger.info(f"Fetching {days}-day history for {asset_id} (ticker: {ticker})")
            
            # Convert days to yfinance period format
            if days <= 5:
                period = "5d"
            elif days <= 30:
                period = "1mo"
            elif days <= 90:
                period = "3mo"
            elif days <= 180:
                period = "6mo"
            elif days <= 365:
                period = "1y"
            elif days <= 730:
                period = "2y"
            else:
                period = "max"
            
            # Run yfinance in thread pool
            loop = asyncio.get_event_loop()
            hist = await loop.run_in_executor(
                _executor,
                lambda: self._fetch_yfinance_data(ticker, period=period, interval="1d")
            )
            
            if hist.empty:
                logger.warning(f"No history data from yfinance for {ticker}")
                return self._get_mock_price_history(asset_id, days)
            
            history = []
            for date, row in hist.iterrows():
                history.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "timestamp": int(date.timestamp() * 1000),
                    "open": float(row['Open']),
                    "high": float(row['High']),
                    "low": float(row['Low']),
                    "close": float(row['Close']),
                    "price": float(row['Close']),  # For backward compatibility
                    "volume": float(row['Volume'])
                })
            
            # Limit to requested days
            history = history[-days:] if len(history) > days else history
            
            self.cache[cache_key] = (history, datetime.now())
            logger.info(f"Retrieved {len(history)} days of history for {asset_id}")
            return history
            
        except Exception as e:
            logger.error(f"Error fetching price history for {asset_id}: {e}")
            return self._get_mock_price_history(asset_id, days)
    
    async def get_price_dataframe(
        self,
        asset_id: str = "ethereum",
        days: int = 365
    ) -> pd.DataFrame:
        """
        Get price history as a pandas DataFrame for ML processing.
        
        Args:
            asset_id: Asset name or ticker symbol
            days: Number of days of history
            
        Returns:
            DataFrame with OHLCV price data
        """
        history = await self.get_price_history(asset_id, days)
        
        df = pd.DataFrame(history)
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        
        # Ensure all required columns exist (yfinance provides real OHLCV data)
        if 'close' not in df.columns and 'price' in df.columns:
            df['close'] = df['price']
        if 'open' not in df.columns:
            df['open'] = df['close'].shift(1).fillna(df['close'])
        if 'high' not in df.columns:
            df['high'] = df['close'] * 1.02
        if 'low' not in df.columns:
            df['low'] = df['close'] * 0.98
        
        return df
    
    async def calculate_volatility(
        self,
        asset_id: str = "ethereum",
        window: int = 30
    ) -> Dict:
        """
        Calculate volatility metrics for an asset using yfinance data.
        
        Args:
            asset_id: Asset name or ticker symbol
            window: Window size for volatility calculation
            
        Returns:
            Dictionary with volatility metrics
        """
        history = await self.get_price_history(asset_id, window + 7)
        
        if len(history) < window:
            return self._get_mock_volatility(asset_id)
        
        prices = [h["price"] for h in history]
        returns = np.diff(prices) / prices[:-1]
        
        # Calculate various volatility measures
        daily_volatility = np.std(returns)
        annualized_volatility = daily_volatility * np.sqrt(365)
        
        # Calculate max drawdown
        peak = prices[0]
        max_drawdown = 0
        for price in prices:
            if price > peak:
                peak = price
            drawdown = (peak - price) / peak
            if drawdown > max_drawdown:
                max_drawdown = drawdown
        
        # Volatility regime classification
        if annualized_volatility < 0.3:
            regime = "low"
        elif annualized_volatility < 0.6:
            regime = "medium"
        elif annualized_volatility < 1.0:
            regime = "high"
        else:
            regime = "extreme"
        
        return {
            "asset": asset_id,
            "daily_volatility": float(daily_volatility),
            "annualized_volatility": float(annualized_volatility),
            "max_drawdown": float(max_drawdown),
            "volatility_regime": regime,
            "calculation_window": window,
            "calculated_at": datetime.now().isoformat()
        }
    
    def _get_mock_market_data(self, asset_id: str) -> Dict:
        """Return mock data for development/testing"""
        mock_prices = {
            "ethereum": 2250.50,
            "bitcoin": 43500.00,
            "chainlink": 14.20,
            "uniswap": 6.50,
            "solana": 120.00,
            "apple": 195.00,
            "google": 140.00,
            "microsoft": 380.00,
            "nvidia": 500.00,
        }
        
        price = mock_prices.get(asset_id.lower(), 100.0)
        
        return {
            "asset": asset_id,
            "ticker": self._get_ticker_symbol(asset_id),
            "name": asset_id.title(),
            "current_price": price,
            "previous_close": price * 0.99,
            "price_change_24h": round(np.random.uniform(-5, 5), 2),
            "price_change_7d": round(np.random.uniform(-10, 10), 2),
            "market_cap": int(price * 1000000000),
            "volume_24h": int(price * 50000000),
            "high_24h": price * 1.02,
            "low_24h": price * 0.98,
            "open_price": price * 0.995,
            "currency": "USD",
            "exchange": "Mock",
            "last_updated": datetime.now().isoformat(),
            "source": "mock"
        }
    
    def _get_mock_price_history(self, asset_id: str, days: int) -> List[Dict]:
        """Generate mock price history for development"""
        base_prices = {
            "ethereum": 2250.50,
            "bitcoin": 43500.00,
            "chainlink": 14.20,
            "uniswap": 6.50,
            "solana": 120.00,
            "apple": 195.00,
            "google": 140.00,
            "microsoft": 380.00,
            "nvidia": 500.00,
        }
        
        base_price = base_prices.get(asset_id.lower(), 100.0)
        history = []
        
        current_price = base_price
        for i in range(days, 0, -1):
            date = datetime.now() - timedelta(days=i)
            
            # Random walk with drift
            change = np.random.normal(0.001, 0.03)
            current_price *= (1 + change)
            
            # Generate realistic OHLCV data
            daily_volatility = abs(np.random.normal(0, 0.02))
            open_price = current_price * (1 + np.random.uniform(-0.01, 0.01))
            high_price = max(open_price, current_price) * (1 + daily_volatility)
            low_price = min(open_price, current_price) * (1 - daily_volatility)
            
            history.append({
                "date": date.strftime("%Y-%m-%d"),
                "timestamp": int(date.timestamp() * 1000),
                "open": open_price,
                "high": high_price,
                "low": low_price,
                "close": current_price,
                "price": current_price,  # For backward compatibility
                "volume": current_price * np.random.uniform(1000000, 5000000)
            })
        
        return history
    
    def _get_mock_volatility(self, asset_id: str) -> Dict:
        """Return mock volatility data"""
        return {
            "asset": asset_id,
            "daily_volatility": 0.035,
            "annualized_volatility": 0.67,
            "max_drawdown": 0.15,
            "volatility_regime": "medium",
            "calculation_window": 30,
            "calculated_at": datetime.now().isoformat()
        }


# Singleton instance
market_service = MarketDataService()
