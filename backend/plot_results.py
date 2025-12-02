"""
Test script for the trained LSTM cryptocurrency price prediction model.
This script loads the trained models and evaluates their performance.
"""
import os
import sys

# Setup environment
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['CUDA_VISIBLE_DEVICES'] = '-1'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import yfinance as yf
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.patches import Patch

# Import after setting environment
from app.ml.lstm_model import LSTMPricePredictor, fetch_crypto_data

# Set style for better looking plots
plt.style.use('seaborn-v0_8-darkgrid')
plt.rcParams['figure.figsize'] = (14, 8)
plt.rcParams['font.size'] = 12


def test_model_loading():
    """Test that models can be loaded successfully."""
    print("\n" + "=" * 60)
    print("TEST 1: Model Loading")
    print("=" * 60)
    
    predictor = LSTMPricePredictor()
    
    # Test Ethereum model
    eth_loaded = predictor.load_model("ethereum")
    print(f"✓ Ethereum model loaded: {eth_loaded}")
    
    # Test Bitcoin model
    btc_predictor = LSTMPricePredictor()
    btc_loaded = btc_predictor.load_model("bitcoin")
    print(f"✓ Bitcoin model loaded: {btc_loaded}")
    
    return eth_loaded and btc_loaded


def test_predictions(crypto_id: str, symbol: str):
    """Test predictions for a specific cryptocurrency."""
    print(f"\n{'=' * 60}")
    print(f"TEST: Predictions for {crypto_id.upper()} ({symbol})")
    print("=" * 60)
    
    # Fetch recent data
    print(f"\nFetching recent data for {symbol}...")
    df = fetch_crypto_data(symbol=symbol, period="6mo")
    print(f"✓ Fetched {len(df)} days of data")
    print(f"  Date range: {df.index[0].strftime('%Y-%m-%d')} to {df.index[-1].strftime('%Y-%m-%d')}")
    
    # Load model and make predictions
    predictor = LSTMPricePredictor()
    predictor.load_model(crypto_id)
    
    print(f"\nMaking predictions...")
    predictions = predictor.predict(df, crypto_id)
    
    # Display results
    print(f"\n{'─' * 40}")
    print(f"PREDICTION RESULTS")
    print(f"{'─' * 40}")
    print(f"Current Price: ${predictions['current_price']:,.2f}")
    print(f"Trend: {predictions['trend'].upper()}")
    print(f"Predicted Change: {predictions['predicted_change_percent']:+.2f}%")
    print(f"Confidence Score: {predictions['confidence_score']:.2%}")
    print(f"Prediction Volatility: ${predictions['prediction_volatility']:,.2f}")
    
    print(f"\n7-Day Price Forecast:")
    print(f"{'─' * 60}")
    print(f"{'Date':<12} {'Predicted':>12} {'Lower':>12} {'Upper':>12}")
    print(f"{'─' * 60}")
    
    for pred in predictions['predictions']:
        print(f"{pred['date']:<12} ${pred['predicted_price']:>10,.2f} "
              f"${pred['lower_bound']:>10,.2f} ${pred['upper_bound']:>10,.2f}")
    
    # Calculate volatility metrics
    volatility_metrics = predictor.calculate_volatility_metrics(predictions)
    
    print(f"\n{'─' * 40}")
    print(f"VOLATILITY METRICS")
    print(f"{'─' * 40}")
    print(f"Predicted Volatility: {volatility_metrics['predicted_volatility']:.4f}")
    print(f"Max Drawdown: {volatility_metrics['max_drawdown']:.4f}")
    print(f"Max Upside: {volatility_metrics['max_upside']:.4f}")
    print(f"Volatility Percentile: {volatility_metrics['volatility_percentile']:.2f}")
    print(f"Trend Strength: {volatility_metrics['trend_strength']:.2f}%")
    print(f"Risk Level: {volatility_metrics['risk_level'].upper()}")
    
    return predictions


def test_model_accuracy(crypto_id: str, symbol: str):
    """Test model accuracy using historical data (backtesting)."""
    print(f"\n{'=' * 60}")
    print(f"TEST: Backtesting Accuracy for {crypto_id.upper()}")
    print("=" * 60)
    
    # Fetch data
    df = fetch_crypto_data(symbol=symbol, period="1y")
    
    # Split into train (older) and test (recent)
    split_idx = len(df) - 30  # Use last 30 days for testing
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]
    
    print(f"\nData split:")
    print(f"  Training: {len(train_df)} days ({train_df.index[0].strftime('%Y-%m-%d')} to {train_df.index[-1].strftime('%Y-%m-%d')})")
    print(f"  Testing:  {len(test_df)} days ({test_df.index[0].strftime('%Y-%m-%d')} to {test_df.index[-1].strftime('%Y-%m-%d')})")
    
    # Load model
    predictor = LSTMPricePredictor()
    predictor.load_model(crypto_id)
    
    # Make predictions using data up to the split point
    predictions = predictor.predict(train_df, crypto_id)
    
    # Compare predictions with actual values
    predicted_prices = [p['predicted_price'] for p in predictions['predictions']]
    actual_prices = test_df['close'].values[:7]  # First 7 days of test set
    
    print(f"\n{'─' * 60}")
    print(f"PREDICTION vs ACTUAL (7-day forecast)")
    print(f"{'─' * 60}")
    print(f"{'Day':<6} {'Predicted':>12} {'Actual':>12} {'Error':>10} {'Error %':>10}")
    print(f"{'─' * 60}")
    
    errors = []
    percent_errors = []
    
    for i, (pred, actual) in enumerate(zip(predicted_prices, actual_prices)):
        error = pred - actual
        percent_error = (error / actual) * 100
        errors.append(abs(error))
        percent_errors.append(abs(percent_error))
        
        print(f"Day {i+1:<3} ${pred:>10,.2f} ${actual:>10,.2f} "
              f"${error:>+9,.2f} {percent_error:>+9.2f}%")
    
    # Summary statistics
    mae = np.mean(errors)
    mape = np.mean(percent_errors)
    rmse = np.sqrt(np.mean([e**2 for e in errors]))
    
    print(f"\n{'─' * 40}")
    print(f"ACCURACY METRICS")
    print(f"{'─' * 40}")
    print(f"Mean Absolute Error (MAE): ${mae:,.2f}")
    print(f"Root Mean Square Error (RMSE): ${rmse:,.2f}")
    print(f"Mean Absolute Percentage Error (MAPE): {mape:.2f}%")
    
    # Direction accuracy
    actual_direction = actual_prices[-1] > train_df['close'].iloc[-1]
    predicted_direction = predicted_prices[-1] > train_df['close'].iloc[-1]
    direction_correct = actual_direction == predicted_direction
    
    print(f"\nTrend Direction Accuracy:")
    print(f"  Predicted trend: {'Bullish' if predicted_direction else 'Bearish'}")
    print(f"  Actual trend: {'Bullish' if actual_direction else 'Bearish'}")
    print(f"  Direction correct: {'✓ YES' if direction_correct else '✗ NO'}")
    
    return {
        'mae': mae,
        'rmse': rmse,
        'mape': mape,
        'direction_correct': direction_correct
    }


def plot_price_history_and_predictions(crypto_id: str, symbol: str):
    """Plot historical prices with 7-day predictions."""
    print(f"\n{'=' * 60}")
    print(f"PLOTTING: {crypto_id.upper()} Price History & Predictions")
    print("=" * 60)
    
    # Fetch recent data (3 months for better visualization)
    df = fetch_crypto_data(symbol=symbol, period="3mo")
    
    # Load model and make predictions
    predictor = LSTMPricePredictor()
    predictor.load_model(crypto_id)
    predictions = predictor.predict(df, crypto_id)
    
    # Create figure
    fig, ax = plt.subplots(figsize=(14, 8))
    
    # Plot historical prices (last 60 days for clarity)
    recent_df = df.tail(60)
    ax.plot(recent_df.index, recent_df['close'], 
            label='Historical Price', color='#2196F3', linewidth=2)
    
    # Prepare prediction data
    last_date = df.index[-1]
    pred_dates = [last_date + timedelta(days=i+1) for i in range(7)]
    pred_prices = [p['predicted_price'] for p in predictions['predictions']]
    lower_bounds = [p['lower_bound'] for p in predictions['predictions']]
    upper_bounds = [p['upper_bound'] for p in predictions['predictions']]
    
    # Connect historical to prediction
    connection_dates = [last_date] + pred_dates
    connection_prices = [df['close'].iloc[-1]] + pred_prices
    
    # Plot predictions
    ax.plot(connection_dates, connection_prices, 
            label='Predicted Price', color='#FF5722', linewidth=2, linestyle='--', marker='o')
    
    # Plot confidence interval
    ax.fill_between(pred_dates, lower_bounds, upper_bounds, 
                    alpha=0.3, color='#FF5722', label='95% Confidence Interval')
    
    # Add current price marker
    ax.scatter([last_date], [df['close'].iloc[-1]], 
               color='#4CAF50', s=150, zorder=5, label=f'Current: ${df["close"].iloc[-1]:,.2f}')
    
    # Formatting
    ax.set_title(f'{crypto_id.upper()} ({symbol}) - Price Prediction\n'
                 f'Trend: {predictions["trend"].upper()} | '
                 f'Confidence: {predictions["confidence_score"]:.1%} | '
                 f'Predicted Change: {predictions["predicted_change_percent"]:+.2f}%',
                 fontsize=14, fontweight='bold')
    ax.set_xlabel('Date', fontsize=12)
    ax.set_ylabel('Price (USD)', fontsize=12)
    ax.legend(loc='upper left', fontsize=10)
    
    # Format x-axis dates
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
    ax.xaxis.set_major_locator(mdates.WeekdayLocator(interval=1))
    plt.xticks(rotation=45)
    
    # Add grid
    ax.grid(True, alpha=0.3)
    
    # Format y-axis with dollar signs
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
    
    plt.tight_layout()
    
    # Save figure
    save_path = f'backend/{crypto_id}_prediction_plot.png'
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"✓ Plot saved to {save_path}")
    
    return fig


def plot_backtesting_results(crypto_id: str, symbol: str):
    """Plot backtesting results comparing predicted vs actual prices."""
    print(f"\n{'=' * 60}")
    print(f"PLOTTING: {crypto_id.upper()} Backtesting Results")
    print("=" * 60)
    
    # Fetch data
    df = fetch_crypto_data(symbol=symbol, period="1y")
    
    # Split data
    split_idx = len(df) - 30
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]
    
    # Load model and make predictions
    predictor = LSTMPricePredictor()
    predictor.load_model(crypto_id)
    predictions = predictor.predict(train_df, crypto_id)
    
    # Get predicted and actual values
    pred_prices = [p['predicted_price'] for p in predictions['predictions']]
    lower_bounds = [p['lower_bound'] for p in predictions['predictions']]
    upper_bounds = [p['upper_bound'] for p in predictions['predictions']]
    actual_prices = test_df['close'].values[:7]
    test_dates = test_df.index[:7]
    
    # Create figure with 2 subplots
    fig, axes = plt.subplots(2, 1, figsize=(14, 12))
    
    # Subplot 1: Predicted vs Actual
    ax1 = axes[0]
    x = np.arange(7)
    width = 0.35
    
    bars1 = ax1.bar(x - width/2, pred_prices, width, label='Predicted', color='#2196F3', alpha=0.8)
    bars2 = ax1.bar(x + width/2, actual_prices, width, label='Actual', color='#4CAF50', alpha=0.8)
    
    # Add error bars for predictions
    ax1.errorbar(x - width/2, pred_prices, 
                 yerr=[(p - l) for p, l in zip(pred_prices, lower_bounds)],
                 fmt='none', color='#1976D2', capsize=5, capthick=2)
    
    ax1.set_xlabel('Day', fontsize=12)
    ax1.set_ylabel('Price (USD)', fontsize=12)
    ax1.set_title(f'{crypto_id.upper()} - Predicted vs Actual Prices (7-Day Forecast)',
                  fontsize=14, fontweight='bold')
    ax1.set_xticks(x)
    ax1.set_xticklabels([f'Day {i+1}\n{d.strftime("%m/%d")}' for i, d in enumerate(test_dates)])
    ax1.legend(loc='upper right', fontsize=10)
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
    ax1.grid(True, alpha=0.3, axis='y')
    
    # Subplot 2: Prediction Error Analysis
    ax2 = axes[1]
    
    errors = [pred - actual for pred, actual in zip(pred_prices, actual_prices)]
    percent_errors = [(pred - actual) / actual * 100 for pred, actual in zip(pred_prices, actual_prices)]
    
    colors = ['#4CAF50' if e < 0 else '#F44336' for e in errors]
    bars = ax2.bar(x, percent_errors, color=colors, alpha=0.8, edgecolor='black')
    
    # Add a zero line
    ax2.axhline(y=0, color='black', linestyle='-', linewidth=1)
    
    # Add value labels on bars
    for bar, pct in zip(bars, percent_errors):
        height = bar.get_height()
        ax2.annotate(f'{pct:+.1f}%',
                     xy=(bar.get_x() + bar.get_width() / 2, height),
                     xytext=(0, 3 if height >= 0 else -15),
                     textcoords="offset points",
                     ha='center', va='bottom' if height >= 0 else 'top',
                     fontsize=10, fontweight='bold')
    
    ax2.set_xlabel('Day', fontsize=12)
    ax2.set_ylabel('Prediction Error (%)', fontsize=12)
    ax2.set_title(f'{crypto_id.upper()} - Prediction Error Analysis\n'
                  f'MAPE: {np.mean(np.abs(percent_errors)):.2f}%',
                  fontsize=14, fontweight='bold')
    ax2.set_xticks(x)
    ax2.set_xticklabels([f'Day {i+1}\n{d.strftime("%m/%d")}' for i, d in enumerate(test_dates)])
    ax2.grid(True, alpha=0.3, axis='y')
    
    # Add legend for error colors
    legend_elements = [Patch(facecolor='#4CAF50', alpha=0.8, label='Under-predicted'),
                       Patch(facecolor='#F44336', alpha=0.8, label='Over-predicted')]
    ax2.legend(handles=legend_elements, loc='upper right', fontsize=10)
    
    plt.tight_layout()
    
    # Save figure
    save_path = f'backend/{crypto_id}_backtest_plot.png'
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"✓ Plot saved to {save_path}")
    
    return fig


def plot_technical_indicators(crypto_id: str, symbol: str):
    """Plot technical indicators used by the LSTM model."""
    print(f"\n{'=' * 60}")
    print(f"PLOTTING: {crypto_id.upper()} Technical Indicators")
    print("=" * 60)
    
    # Fetch data
    df = fetch_crypto_data(symbol=symbol, period="6mo")
    
    # Prepare features (same as in LSTM model)
    predictor = LSTMPricePredictor()
    df_features = predictor.prepare_features(df)
    
    # Use last 90 days for clearer visualization
    df_plot = df_features.tail(90)
    
    # Create figure with 4 subplots
    fig, axes = plt.subplots(4, 1, figsize=(14, 16), sharex=True)
    
    # Subplot 1: Price with Moving Averages
    ax1 = axes[0]
    ax1.plot(df_plot.index, df_plot['price'], label='Price', color='#2196F3', linewidth=2)
    ax1.plot(df_plot.index, df_plot['ma_7'], label='MA(7)', color='#FF9800', linewidth=1.5, alpha=0.8)
    ax1.plot(df_plot.index, df_plot['ma_14'], label='MA(14)', color='#9C27B0', linewidth=1.5, alpha=0.8)
    ax1.plot(df_plot.index, df_plot['ma_30'], label='MA(30)', color='#4CAF50', linewidth=1.5, alpha=0.8)
    ax1.set_ylabel('Price (USD)', fontsize=11)
    ax1.set_title(f'{crypto_id.upper()} ({symbol}) - Technical Indicators Analysis',
                  fontsize=14, fontweight='bold')
    ax1.legend(loc='upper left', fontsize=9)
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
    ax1.grid(True, alpha=0.3)
    
    # Subplot 2: Bollinger Bands
    ax2 = axes[1]
    ax2.plot(df_plot.index, df_plot['price'], label='Price', color='#2196F3', linewidth=2)
    ax2.plot(df_plot.index, df_plot['bb_middle'], label='BB Middle', color='#FF5722', linewidth=1.5)
    ax2.fill_between(df_plot.index, df_plot['bb_lower'], df_plot['bb_upper'], 
                     alpha=0.2, color='#FF5722', label='BB Band')
    ax2.set_ylabel('Price (USD)', fontsize=11)
    ax2.set_title('Bollinger Bands', fontsize=12, fontweight='bold')
    ax2.legend(loc='upper left', fontsize=9)
    ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
    ax2.grid(True, alpha=0.3)
    
    # Subplot 3: RSI
    ax3 = axes[2]
    ax3.plot(df_plot.index, df_plot['rsi'], label='RSI(14)', color='#673AB7', linewidth=2)
    ax3.axhline(y=70, color='#F44336', linestyle='--', linewidth=1.5, label='Overbought (70)')
    ax3.axhline(y=30, color='#4CAF50', linestyle='--', linewidth=1.5, label='Oversold (30)')
    ax3.fill_between(df_plot.index, 30, 70, alpha=0.1, color='#673AB7')
    ax3.set_ylabel('RSI', fontsize=11)
    ax3.set_title('Relative Strength Index (RSI)', fontsize=12, fontweight='bold')
    ax3.set_ylim(0, 100)
    ax3.legend(loc='upper left', fontsize=9)
    ax3.grid(True, alpha=0.3)
    
    # Subplot 4: MACD
    ax4 = axes[3]
    ax4.plot(df_plot.index, df_plot['macd'], label='MACD', color='#2196F3', linewidth=2)
    ax4.plot(df_plot.index, df_plot['macd_signal'], label='Signal', color='#FF5722', linewidth=1.5)
    macd_hist = df_plot['macd'] - df_plot['macd_signal']
    colors = ['#4CAF50' if val >= 0 else '#F44336' for val in macd_hist]
    ax4.bar(df_plot.index, macd_hist, color=colors, alpha=0.5, label='Histogram')
    ax4.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
    ax4.set_xlabel('Date', fontsize=11)
    ax4.set_ylabel('MACD', fontsize=11)
    ax4.set_title('MACD (Moving Average Convergence Divergence)', fontsize=12, fontweight='bold')
    ax4.legend(loc='upper left', fontsize=9)
    ax4.grid(True, alpha=0.3)
    
    # Format x-axis
    ax4.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
    ax4.xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))
    plt.xticks(rotation=45)
    
    plt.tight_layout()
    
    # Save figure
    save_path = f'backend/{crypto_id}_indicators_plot.png'
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"✓ Plot saved to {save_path}")
    
    return fig


def plot_volatility_analysis(crypto_id: str, symbol: str):
    """Plot volatility analysis for the cryptocurrency."""
    print(f"\n{'=' * 60}")
    print(f"PLOTTING: {crypto_id.upper()} Volatility Analysis")
    print("=" * 60)
    
    # Fetch data
    df = fetch_crypto_data(symbol=symbol, period="6mo")
    
    # Prepare features
    predictor = LSTMPricePredictor()
    df_features = predictor.prepare_features(df)
    
    # Use last 90 days
    df_plot = df_features.tail(90)
    
    # Create figure with 3 subplots
    fig, axes = plt.subplots(3, 1, figsize=(14, 12), sharex=True)
    
    # Subplot 1: Price with Volatility Bands
    ax1 = axes[0]
    ax1.plot(df_plot.index, df_plot['price'], label='Price', color='#2196F3', linewidth=2)
    
    # Add volatility bands
    upper_band = df_plot['price'] + 2 * df_plot['volatility_14']
    lower_band = df_plot['price'] - 2 * df_plot['volatility_14']
    ax1.fill_between(df_plot.index, lower_band, upper_band, 
                     alpha=0.2, color='#FF5722', label='2σ Volatility Band')
    
    ax1.set_ylabel('Price (USD)', fontsize=11)
    ax1.set_title(f'{crypto_id.upper()} ({symbol}) - Volatility Analysis',
                  fontsize=14, fontweight='bold')
    ax1.legend(loc='upper left', fontsize=9)
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
    ax1.grid(True, alpha=0.3)
    
    # Subplot 2: Rolling Volatility
    ax2 = axes[1]
    ax2.plot(df_plot.index, df_plot['volatility_7'], label='7-Day Volatility', 
             color='#4CAF50', linewidth=2)
    ax2.plot(df_plot.index, df_plot['volatility_14'], label='14-Day Volatility', 
             color='#FF5722', linewidth=2)
    ax2.fill_between(df_plot.index, 0, df_plot['volatility_14'], alpha=0.2, color='#FF5722')
    ax2.set_ylabel('Volatility (USD)', fontsize=11)
    ax2.set_title('Rolling Volatility (Standard Deviation)', fontsize=12, fontweight='bold')
    ax2.legend(loc='upper left', fontsize=9)
    ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'${x:,.0f}'))
    ax2.grid(True, alpha=0.3)
    
    # Subplot 3: Daily Returns Distribution
    ax3 = axes[2]
    returns = df_plot['log_return'] * 100  # Convert to percentage
    
    # Color bars based on positive/negative
    colors = ['#4CAF50' if r >= 0 else '#F44336' for r in returns]
    ax3.bar(df_plot.index, returns, color=colors, alpha=0.7, width=0.8)
    ax3.axhline(y=0, color='black', linestyle='-', linewidth=0.5)
    
    # Add mean line
    mean_return = returns.mean()
    ax3.axhline(y=mean_return, color='#2196F3', linestyle='--', linewidth=2, 
                label=f'Mean: {mean_return:.2f}%')
    
    ax3.set_xlabel('Date', fontsize=11)
    ax3.set_ylabel('Daily Return (%)', fontsize=11)
    ax3.set_title(f'Daily Log Returns (Avg: {mean_return:.2f}%, Std: {returns.std():.2f}%)',
                  fontsize=12, fontweight='bold')
    ax3.legend(loc='upper left', fontsize=9)
    ax3.grid(True, alpha=0.3)
    
    # Format x-axis
    ax3.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d'))
    ax3.xaxis.set_major_locator(mdates.WeekdayLocator(interval=2))
    plt.xticks(rotation=45)
    
    plt.tight_layout()
    
    # Save figure
    save_path = f'backend/{crypto_id}_volatility_plot.png'
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"✓ Plot saved to {save_path}")
    
    return fig


def plot_model_comparison():
    """Plot comparison between Ethereum and Bitcoin model performance."""
    print(f"\n{'=' * 60}")
    print(f"PLOTTING: Model Performance Comparison")
    print("=" * 60)
    
    # Collect metrics for both cryptocurrencies
    results = {}
    
    for crypto_id, symbol in [("ethereum", "ETH-USD"), ("bitcoin", "BTC-USD")]:
        df = fetch_crypto_data(symbol=symbol, period="1y")
        split_idx = len(df) - 30
        train_df = df.iloc[:split_idx]
        test_df = df.iloc[split_idx:]
        
        predictor = LSTMPricePredictor()
        predictor.load_model(crypto_id)
        predictions = predictor.predict(train_df, crypto_id)
        
        pred_prices = [p['predicted_price'] for p in predictions['predictions']]
        actual_prices = test_df['close'].values[:7]
        
        errors = [abs(pred - actual) for pred, actual in zip(pred_prices, actual_prices)]
        percent_errors = [abs((pred - actual) / actual * 100) for pred, actual in zip(pred_prices, actual_prices)]
        
        results[crypto_id] = {
            'mae': np.mean(errors),
            'mape': np.mean(percent_errors),
            'rmse': np.sqrt(np.mean([e**2 for e in errors])),
            'confidence': predictions['confidence_score'],
            'daily_mape': percent_errors
        }
    
    # Create comparison figure
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    
    # Subplot 1: MAPE Comparison
    ax1 = axes[0, 0]
    cryptos = ['Ethereum', 'Bitcoin']
    mapes = [results['ethereum']['mape'], results['bitcoin']['mape']]
    colors = ['#627EEA', '#F7931A']  # ETH blue, BTC orange
    
    bars = ax1.bar(cryptos, mapes, color=colors, alpha=0.8, edgecolor='black')
    ax1.set_ylabel('MAPE (%)', fontsize=11)
    ax1.set_title('Mean Absolute Percentage Error', fontsize=12, fontweight='bold')
    ax1.grid(True, alpha=0.3, axis='y')
    
    for bar, val in zip(bars, mapes):
        ax1.annotate(f'{val:.2f}%', xy=(bar.get_x() + bar.get_width() / 2, val),
                     xytext=(0, 5), textcoords="offset points",
                     ha='center', fontsize=12, fontweight='bold')
    
    # Subplot 2: Confidence Score
    ax2 = axes[0, 1]
    confidences = [results['ethereum']['confidence'] * 100, results['bitcoin']['confidence'] * 100]
    
    bars = ax2.bar(cryptos, confidences, color=colors, alpha=0.8, edgecolor='black')
    ax2.set_ylabel('Confidence (%)', fontsize=11)
    ax2.set_title('Model Confidence Score', fontsize=12, fontweight='bold')
    ax2.set_ylim(0, 100)
    ax2.grid(True, alpha=0.3, axis='y')
    
    for bar, val in zip(bars, confidences):
        ax2.annotate(f'{val:.1f}%', xy=(bar.get_x() + bar.get_width() / 2, val),
                     xytext=(0, 5), textcoords="offset points",
                     ha='center', fontsize=12, fontweight='bold')
    
    # Subplot 3: Daily MAPE Breakdown
    ax3 = axes[1, 0]
    x = np.arange(7)
    width = 0.35
    
    ax3.bar(x - width/2, results['ethereum']['daily_mape'], width, 
            label='Ethereum', color='#627EEA', alpha=0.8)
    ax3.bar(x + width/2, results['bitcoin']['daily_mape'], width, 
            label='Bitcoin', color='#F7931A', alpha=0.8)
    
    ax3.set_xlabel('Prediction Day', fontsize=11)
    ax3.set_ylabel('Absolute Error (%)', fontsize=11)
    ax3.set_title('Daily Prediction Error Comparison', fontsize=12, fontweight='bold')
    ax3.set_xticks(x)
    ax3.set_xticklabels([f'Day {i+1}' for i in range(7)])
    ax3.legend(loc='upper right', fontsize=10)
    ax3.grid(True, alpha=0.3, axis='y')
    
    # Subplot 4: Summary Metrics Radar/Comparison
    ax4 = axes[1, 1]
    
    metrics = ['MAE\n(normalized)', 'MAPE (%)', 'RMSE\n(normalized)', 'Confidence (%)']
    
    # Normalize MAE and RMSE for comparison
    max_mae = max(results['ethereum']['mae'], results['bitcoin']['mae'])
    max_rmse = max(results['ethereum']['rmse'], results['bitcoin']['rmse'])
    
    eth_values = [
        results['ethereum']['mae'] / max_mae * 100,
        results['ethereum']['mape'],
        results['ethereum']['rmse'] / max_rmse * 100,
        results['ethereum']['confidence'] * 100
    ]
    
    btc_values = [
        results['bitcoin']['mae'] / max_mae * 100,
        results['bitcoin']['mape'],
        results['bitcoin']['rmse'] / max_rmse * 100,
        results['bitcoin']['confidence'] * 100
    ]
    
    x = np.arange(len(metrics))
    
    ax4.plot(x, eth_values, 'o-', color='#627EEA', linewidth=2, markersize=10, label='Ethereum')
    ax4.plot(x, btc_values, 's-', color='#F7931A', linewidth=2, markersize=10, label='Bitcoin')
    
    ax4.set_xticks(x)
    ax4.set_xticklabels(metrics)
    ax4.set_ylabel('Score', fontsize=11)
    ax4.set_title('Model Performance Overview', fontsize=12, fontweight='bold')
    ax4.legend(loc='lower right', fontsize=10)
    ax4.grid(True, alpha=0.3)
    ax4.set_ylim(0, 110)
    
    plt.tight_layout()
    
    # Save figure
    save_path = 'backend/model_comparison_plot.png'
    plt.savefig(save_path, dpi=150, bbox_inches='tight')
    print(f"✓ Plot saved to {save_path}")
    
    return fig


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("LSTM MODEL TESTING SUITE")
    print("=" * 60)
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Test 1: Model Loading
    models_loaded = test_model_loading()
    
    if not models_loaded:
        print("\n❌ Error: Models not loaded. Please train the models first.")
        return
    
    # Test 2: Predictions for Ethereum
    eth_predictions = test_predictions("ethereum", "ETH-USD")
    
    # Test 3: Predictions for Bitcoin
    btc_predictions = test_predictions("bitcoin", "BTC-USD")
    
    # Test 4: Backtesting accuracy for Ethereum
    eth_accuracy = test_model_accuracy("ethereum", "ETH-USD")
    
    # Test 5: Backtesting accuracy for Bitcoin
    btc_accuracy = test_model_accuracy("bitcoin", "BTC-USD")
    
    # Final Summary
    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    
    print(f"\n{'Cryptocurrency':<15} {'MAE':>12} {'MAPE':>10} {'Direction':>12}")
    print(f"{'─' * 50}")
    print(f"{'Ethereum':<15} ${eth_accuracy['mae']:>10,.2f} {eth_accuracy['mape']:>9.2f}% "
          f"{'✓ Correct' if eth_accuracy['direction_correct'] else '✗ Wrong':>12}")
    print(f"{'Bitcoin':<15} ${btc_accuracy['mae']:>10,.2f} {btc_accuracy['mape']:>9.2f}% "
          f"{'✓ Correct' if btc_accuracy['direction_correct'] else '✗ Wrong':>12}")
    
    print(f"\n{'=' * 60}")
    print("All tests completed!")
    print("=" * 60)
    
    # Generate plots
    print("\n" + "=" * 60)
    print("GENERATING VISUALIZATION PLOTS")
    print("=" * 60)
    
    # Plot 1: Price predictions for both cryptocurrencies
    plot_price_history_and_predictions("ethereum", "ETH-USD")
    plot_price_history_and_predictions("bitcoin", "BTC-USD")
    
    # Plot 2: Backtesting results
    plot_backtesting_results("ethereum", "ETH-USD")
    plot_backtesting_results("bitcoin", "BTC-USD")
    
    # Plot 3: Technical indicators
    plot_technical_indicators("ethereum", "ETH-USD")
    plot_technical_indicators("bitcoin", "BTC-USD")
    
    # Plot 4: Volatility analysis
    plot_volatility_analysis("ethereum", "ETH-USD")
    plot_volatility_analysis("bitcoin", "BTC-USD")
    
    # Plot 5: Model comparison
    plot_model_comparison()
    
    print("\n" + "=" * 60)
    print("ALL PLOTS GENERATED SUCCESSFULLY!")
    print("=" * 60)
    print("\nPlots saved to backend/ directory:")
    print("  - ethereum_prediction_plot.png")
    print("  - bitcoin_prediction_plot.png")
    print("  - ethereum_backtest_plot.png")
    print("  - bitcoin_backtest_plot.png")
    print("  - ethereum_indicators_plot.png")
    print("  - bitcoin_indicators_plot.png")
    print("  - ethereum_volatility_plot.png")
    print("  - bitcoin_volatility_plot.png")
    print("  - model_comparison_plot.png")
    
    # Show all plots
    plt.show()


if __name__ == "__main__":
    main()
