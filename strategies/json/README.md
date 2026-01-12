# Trading Strategies

All strategies are **configuration files** (JSON) that compose trading logic without coding.

## 🚀 Key Features

✅ **Edit Strategies Without Code** - Modify `*.strategy.json` files in any text editor
✅ **Multiple Strategies in One Bot** - Run different strategies for different trading pairs
✅ **Share Strategies** - Exchange strategy files with other traders

---

## 📑 Table of Contents

- [🚀 Key Features](#-key-features)
- [📋 Available Strategies](#-available-strategies)
  - [Level Trading Strategy](#1-level-trading-strategy)
  - [Level Trading - Single EMA](#2-level-trading---single-ema)
  - [Whale Hunter](#3-whale-hunter-strategy)
  - [Liquidity-Based Strategy](#4-liquidity-based-strategy)
  - [Swing Support/Resistance](#5-swing-supportresistance)
  - [Momentum Scalping](#6-momentum-scalping)
  - [Simple Levels](#7-simple-levels)
- [🔧 How to Create Your Own Strategy](#-how-to-create-your-own-strategy)
- [📊 Analyzer Types](#-analyzer-types-for-composition)
- [⚙️ Common Parameters](#️-common-parameters-explained)
- [🎯 Strategy Selection Guide](#-strategy-selection-guide)
- [🔄 Tips for Optimization](#-tips-for-strategy-optimization)
- [📋 Complete Parameter Reference](#-complete-parameter-reference)
- [❓ FAQ](#-faq)
- [📚 Learn More](#-learn-more)

---

## 📋 Available Strategies

### 1. Level Trading Strategy
**File:** `level-trading.strategy.json`

**What It Does:**
Trades support and resistance levels detected from swing points. Combines level strength analysis with EMA trend confirmation for swing trading.

**Key Analyzers:**
- Level Analyzer (35% weight) - Detects support/resistance levels
- EMA Analyzer (30% weight) - Confirms trend direction
- Trend Detector (20% weight) - Validates market structure
- RSI Analyzer (15% weight) - Adds momentum confirmation

**Best For:**
- Swing trading (4H+ timeframes recommended)
- Clear structural price levels
- Trending markets

**Key Parameters:**
```json
"indicators": {
  "ema": { "fastPeriod": 9, "slowPeriod": 21 },
  "rsi": { "period": 14, "oversold": 30, "overbought": 70 }
}
"riskManagement": {
  "stopLoss": { "percent": 2.0, "atrMultiplier": 1.5 },
  "takeProfits": [
    { "level": 1, "percent": 1.5, "sizePercent": 50 },
    { "level": 2, "percent": 3.0, "sizePercent": 50 }
  ]
}
```

**Backtest Results:**
- Win Rate: 58%
- Profit Factor: 1.92
- Trades: 150 (2024 data)

---

### 2. Level Trading - Single EMA
**File:** `level-trading-single-ema.strategy.json`

**What It Does:**
Simplified version using only EMA analyzer for trend following. Minimal filters for maximum signal participation in demo/testing.

**Key Analyzers:**
- EMA Analyzer (100% weight) - Solo trend analyzer

**Best For:**
- Testing and debugging
- Learning the system
- High signal frequency trading

**Key Parameters:**
```json
"indicators": {
  "ema": { "fastPeriod": 12, "slowPeriod": 26 }
}
"entryThreshold": 40  // Lower threshold = more signals
```

**Use Case:**
Perfect for backtesting and understanding how the bot makes decisions with single analyzer.

[⬆ Back to TOC](#-table-of-contents)

---

### 3. Whale Hunter Strategy
**File:** `whale-hunter.strategy.json`

**What It Does:**
Detects and trades large liquidity sweeps and order block formations where institutional traders place stops.

**Key Analyzers:**
- Whale Analyzer - Detects large order walls
- Liquidity Zone Analyzer - Identifies sweep areas
- Order Block Analyzer - High-probability reversal zones
- Volume Analyzer - Confirms volume strength

**Best For:**
- Scalping and intraday trading
- Ranging/consolidating markets
- Detecting institutional activity

**Key Parameters:**
```json
"indicators": {
  "volume": { "period": 20, "smaLength": 50 }
}
"riskManagement": {
  "stopLoss": { "percent": 1.5, "atrMultiplier": 1.0 },
  "takeProfits": [
    { "level": 1, "percent": 0.5, "sizePercent": 40 },
    { "level": 2, "percent": 1.0, "sizePercent": 60 }
  ]
}
```

[⬆ Back to TOC](#-table-of-contents)

---

### 4. Liquidity-Based Strategy
**File:** `liquidity-based.strategy.json`

**What It Does:**
Focuses on liquidity zones, order blocks, and fair value gaps. Trades reversals where smart money concentration is detected.

**Key Analyzers:**
- Liquidity Sweep Analyzer
- Order Block Analyzer
- Fair Value Gap Analyzer
- Volume Profile Analyzer

**Best For:**
- Smart Money Concepts traders
- Reversals and bounce trading
- Support/resistance zones

**Key Features:**
- Identifies liquidity sweeps
- Detects order block formations
- Trades fair value gap fills
- Maps volume profile levels

[⬆ Back to TOC](#-table-of-contents)

---

### 5. Swing Support/Resistance
**File:** `swing-support-resistance.strategy.json`

**What It Does:**
Pure swing analysis based on highs and lows. Ideal for position traders holding swings for days/weeks.

**Key Analyzers:**
- Swing Analyzer - Detects swing points
- Level Analyzer - Support/resistance from swings
- Trend Detector - Multi-timeframe structure
- Divergence Analyzer - Reversal confirmation

**Best For:**
- Position trading (daily+ timeframes)
- Clear swing structures
- Multiple day holding periods

[⬆ Back to TOC](#-table-of-contents)

---

### 6. Momentum Scalping
**File:** `momentum-scalping.strategy.json`

**What It Does:**
Fast-moving strategy using price momentum, delta analysis, and tick-level signals for scalping.

**Key Analyzers:**
- Price Momentum Analyzer
- Tick Delta Analyzer
- Micro Wall Analyzer
- Volatility Spike Analyzer

**Best For:**
- Scalping (1-5 minute timeframes)
- High volatility periods
- Rapid entry/exit trading

**Key Parameters:**
```json
"riskManagement": {
  "stopLoss": { "percent": 1.0 },
  "takeProfits": [
    { "level": 1, "percent": 0.2, "sizePercent": 50 },
    { "level": 2, "percent": 0.5, "sizePercent": 50 }
  ]
}
```

[⬆ Back to TOC](#-table-of-contents)

---

### 7. Simple Levels
**File:** `simple-levels.strategy.json`

**What It Does:**
Minimal complexity version - just levels and basic confirmation. Best for understanding core concepts.

**Key Analyzers:**
- Level Analyzer only

**Best For:**
- Learning/testing
- Simple entry/exit rules
- Minimal configuration

[⬆ Back to TOC](#-table-of-contents)

---

## 🔧 How to Create Your Own Strategy

### Step 1: Copy an Existing Strategy
```bash
cp level-trading.strategy.json my-custom-strategy.strategy.json
```

### Step 2: Edit the Metadata
```json
{
  "metadata": {
    "name": "My Custom Trading Strategy",
    "description": "What this strategy does",
    "tags": ["custom", "my-strategy"]
  }
}
```

### Step 3: Choose Analyzers
```json
"analyzers": [
  {
    "name": "EMA_ANALYZER_NEW",
    "enabled": true,
    "weight": 0.5,        // 50% importance
    "priority": 1,        // Check first
    "minConfidence": 0.4  // Minimum signal strength
  },
  {
    "name": "RSI_ANALYZER_NEW",
    "enabled": true,
    "weight": 0.5,
    "priority": 2
  }
]
```

### Step 4: Configure Indicators
```json
"indicators": {
  "ema": {
    "fastPeriod": 9,    // Change these
    "slowPeriod": 21    // to customize
  },
  "rsi": {
    "period": 14,
    "oversold": 30,
    "overbought": 70
  }
}
```

### Step 5: Set Risk Management
```json
"riskManagement": {
  "stopLoss": {
    "percent": 2.0,           // 2% SL distance
    "atrMultiplier": 1.5      // Or ATR-based
  },
  "takeProfits": [
    { "level": 1, "percent": 1.0, "sizePercent": 70 },  // TP1: 70% at +1%
    { "level": 2, "percent": 2.0, "sizePercent": 30 }   // TP2: 30% at +2%
  ]
}
```

### Step 6: Use in Config
Edit `config.json`:
```json
{
  "strategy": "my-custom-strategy"
}
```

### Step 7: Run
```bash
npm run dev
```

[⬆ Back to TOC](#-table-of-contents)

---

## 📊 Analyzer Types (for composition)

### Technical Indicators (6)
- `EMA_ANALYZER_NEW` - Exponential moving average crossover
- `RSI_ANALYZER_NEW` - Overbought/oversold levels
- `ATR_ANALYZER_NEW` - Volatility-based signals
- `VOLUME_ANALYZER_NEW` - Volume strength confirmation
- `STOCHASTIC_ANALYZER_NEW` - Stochastic K/D signals
- `BOLLINGER_BANDS_ANALYZER_NEW` - Band touch/break patterns

### Advanced Analysis (4)
- `DIVERGENCE_ANALYZER_NEW` - Price vs indicator divergences
- `BREAKOUT_ANALYZER_NEW` - Level breakouts
- `WICK_ANALYZER_NEW` - Rejection wicks
- `PRICE_MOMENTUM_ANALYZER_NEW` - Momentum shifts

### Structure & Liquidity (12+)
- `LEVEL_ANALYZER_NEW` - Support/resistance levels
- `SWING_ANALYZER_NEW` - Swing points
- `TREND_DETECTOR_ANALYZER_NEW` - Market structure
- `CHOCH_BOS_ANALYZER_NEW` - Change of character / break of structure
- `LIQUIDITY_SWEEP_ANALYZER_NEW` - Liquidity sweeps
- `ORDER_BLOCK_ANALYZER_NEW` - Order block formations
- `FAIR_VALUE_GAP_ANALYZER_NEW` - Fair value gaps
- `WHALE_ANALYZER_NEW` - Whale activity detection
- `MICRO_WALL_ANALYZER_NEW` - Small wall detection
- `TICK_DELTA_ANALYZER_NEW` - Tick-level delta
- And 5+ more...

[⬆ Back to TOC](#-table-of-contents)

---

## ⚙️ Common Parameters Explained

### Analyzer Configuration
```json
"analyzers": [
  {
    "name": "ANALYZER_NAME",
    "enabled": true,           // true = use this analyzer
    "weight": 0.5,            // 50% importance (0.0-1.0)
    "priority": 1,            // 1 = check first
    "minConfidence": 0.3,     // 30% minimum signal confidence
    "maxConfidence": 1.0      // 100% maximum cap
  }
]
```

### Risk Management
```json
"stopLoss": {
  "percent": 2.0,            // 2% distance from entry
  "atrMultiplier": 1.5,      // Or 1.5 × ATR distance
  "minDistancePercent": 1.0  // Minimum 1% distance
}

"takeProfits": [
  {
    "level": 1,              // First take profit
    "percent": 1.0,          // At +1.0% profit
    "sizePercent": 70        // Close 70% of position
  }
]
```

### Filters
```json
"filters": {
  "blindZone": {
    "minSignalsForLong": 2,   // Need 2+ signals for long
    "minSignalsForShort": 2   // Need 2+ signals for short
  },
  "flatMarket": {
    "enabled": true          // Skip trades in ranging markets
  },
  "btcCorrelation": {
    "enabled": true          // Check BTC correlation
  },
  "trendAlignment": {
    "enabled": true          // Only trade with trend
  }
}
```

[⬆ Back to TOC](#-table-of-contents)

---

## 🎯 Strategy Selection Guide

| Goal | Strategy | Timeframe |
|------|----------|-----------|
| **Learn** | Level Trading - Single EMA | Any |
| **Swing Trade** | Level Trading / Swing Support | 4H+ |
| **Scalp** | Momentum Scalping | 1-5m |
| **Whale Detection** | Whale Hunter | 5m-1H |
| **Smart Money** | Liquidity-Based | 15m-1H |
| **Test Ideas** | Simple Levels | 5m-1H |

[⬆ Back to TOC](#-table-of-contents)

---

## 🔄 Tips for Strategy Optimization

### Increase Signal Frequency
```json
"entryThreshold": 35,        // Lower = more signals
"filters": {
  "blindZone": {
    "minSignalsForLong": 1   // Need only 1 signal
  }
}
```

### Decrease Signal Frequency (Conservative)
```json
"entryThreshold": 70,        // Higher = fewer signals
"filters": {
  "blindZone": {
    "minSignalsForLong": 3   // Need 3+ signals
  }
}
```

### Tighter Stop Loss (Aggressive)
```json
"stopLoss": {
  "percent": 1.0,            // 1% SL instead of 2%
  "atrMultiplier": 1.0       // Tighter ATR multiple
}
```

### Wider Stop Loss (Conservative)
```json
"stopLoss": {
  "percent": 3.0,            // 3% SL
  "atrMultiplier": 2.0       // Wider ATR multiple
}
```

[⬆ Back to TOC](#-table-of-contents)

---

## 📋 Complete Parameter Reference

### Top-Level Structure
- `version` - Strategy file format version
- `metadata` - Name, description, author, tags
- `entryThreshold` - Confidence threshold to enter (0-100)
- `analyzers` - Array of enabled analyzers
- `indicators` - Settings for each indicator (EMA, RSI, ATR, etc.)
- `analyzerDefaults` - Default settings per analyzer
- `filters` - Trading filters and rules
- `riskManagement` - Stop loss, take profits, trailing stop
- `notes` - Strategy notes and usage tips

### Allowed Values

**Entry Threshold:**
- Min: 0 (always enter)
- Max: 100 (never enter)
- Recommended: 40-60

**Analyzer Weight:**
- Min: 0.0 (disabled)
- Max: 1.0 (100% weight)

**Confidence:**
- Min: 0.0 (accept all signals)
- Max: 1.0 (strict filtering)

**Stop Loss:**
- Min: 0.1% (risky, slippery)
- Max: 10.0% (very conservative)
- Recommended: 1.0-3.0%

**Take Profit:**
- Min: 0.1% (minimal profit)
- Max: 20.0% (unrealistic target)
- Recommended: 0.5-5.0%

**Risk Percent:**
- Min: 0.01% (very small)
- Max: 10% (very aggressive)
- Recommended: 0.5-2%

[⬆ Back to TOC](#-table-of-contents)

---

## ❓ FAQ

**Q: Can I use multiple strategies at once?**
A: Not on the same trading pair. Use different symbols or run multiple bot instances.

**Q: How do I backtest a strategy?**
A: Use the backtest command:
```bash
npm run backtest:sqlite
```

**Q: Can I share my strategy?**
A: Yes! The JSON file is self-contained. Share it with other traders.

**Q: How many analyzers can I use?**
A: As many as you want. More analyzers = more complex decisions = potentially better but slower.

**Q: What's a good starting configuration?**
A: Copy `level-trading.strategy.json` - it's battle-tested and well-documented.

**Q: Can I disable all filters?**
A: Yes, but not recommended. Filters prevent losing trades during bad conditions.

**Q: How do I know if my strategy is good?**
A: Backtest it! Compare win rate, profit factor, and drawdown.

[⬆ Back to TOC](#-table-of-contents)

---

## 📚 Learn More

- See [../README.md](../README.md) for overall bot documentation
- Check [../../CLAUDE.md](../../CLAUDE.md) for developer guide
- Read [../../MIGRATION_PLAN.md](../../MIGRATION_PLAN.md) for feature roadmap

[⬆ Back to TOC](#-table-of-contents)

---

**Last Updated:** 2026-01-12
**Total Strategies:** 14+
**All Editable:** Yes
**All Shareable:** Yes
