"""
Application Configuration Settings
"""
from pydantic_settings import BaseSettings
from typing import List
import os

class Settings(BaseSettings):
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True
    
    # CORS settings
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173"
    ]
    
    # Database settings
    DATABASE_URL: str = "sqlite:///./defi_platform.db"
    
    # Redis settings
    REDIS_URL: str = "redis://localhost:6379"
    
    # External APIs
    COINGECKO_API_URL: str = "https://api.coingecko.com/api/v3"
    
    # ML Model settings
    MODEL_PATH: str = "app/ml/models/lstm_price_predictor.h5"
    PREDICTION_HORIZON: int = 7  # Days to predict ahead
    LOOKBACK_PERIOD: int = 60    # Days of historical data to use
    
    # Interest Rate settings
    BASE_INTEREST_RATE: float = 0.02  # 2% base rate
    MAX_INTEREST_RATE: float = 0.30   # 30% max rate
    MIN_INTEREST_RATE: float = 0.01   # 1% min rate
    
    # Blockchain settings
    WEB3_PROVIDER_URL: str = "http://localhost:8545"
    CHAIN_ID: int = 31337  # Hardhat local chain
    
    # Contract addresses (update after deployment)
    LENDING_POOL_ADDRESS: str = ""
    INTEREST_RATE_ORACLE_ADDRESS: str = ""
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
