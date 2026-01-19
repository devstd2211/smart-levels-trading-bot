#!/bin/bash

# Phase 3.2: Refactor 23 advanced analyzers to implement IAnalyzer

ANALYZERS=(
    # Divergence (1)
    "divergence:DIVERGENCE:Divergence"

    # Breakout (1)
    "breakout:BREAKOUT:Breakout"

    # Price Action (2)
    "price-action:PRICE_ACTION:PriceAction"
    "wick:WICK:Wick"

    # Structure (4)
    "choch-bos:CHOCH_BOS:ChochBos"
    "swing:SWING:Swing"
    "trend-conflict:TREND_CONFLICT:TrendConflict"
    "trend-detector:TREND_DETECTOR:TrendDetector"

    # Levels (4)
    "level:LEVEL:Level"
    "micro-wall:MICRO_WALL:MicroWall"
    "order-block:ORDER_BLOCK:OrderBlock"
    "fair-value-gap:FAIR_VALUE_GAP:FairValueGap"

    # Liquidity & SMC (5)
    "liquidity-sweep:LIQUIDITY_SWEEP:LiquiditySweep"
    "liquidity-zone:LIQUIDITY_ZONE:LiquidityZone"
    "whale:WHALE:Whale"
    "volatility-spike:VOLATILITY_SPIKE:VolatilitySpike"
    "footprint:FOOTPRINT:Footprint"

    # Order Flow (3)
    "order-flow:ORDER_FLOW:OrderFlow"
    "tick-delta:TICK_DELTA:TickDelta"
    "delta:DELTA:Delta"

    # Scalping (2)
    "price-momentum:PRICE_MOMENTUM:PriceMomentum"
    "volume-profile:VOLUME_PROFILE:VolumeProfile"
)

echo "🚀 Phase 3.2: Refactoring 23 advanced analyzers to implement IAnalyzer"
echo "===================================================================="

for analyzer_info in "${ANALYZERS[@]}"; do
    IFS=':' read -r file_name enum_name class_name <<< "$analyzer_info"

    file_path="src/analyzers/${file_name}.analyzer-new.ts"

    if [ ! -f "$file_path" ]; then
        echo "❌ File not found: $file_path"
        continue
    fi

    echo "📝 Processing: $file_path (${enum_name})"

    # Check if already has IAnalyzer import
    if grep -q "import.*IAnalyzer" "$file_path"; then
        echo "   ✅ Already has IAnalyzer import"
    else
        # Add imports after existing imports
        sed -i "/import.*logger.service/a import { IAnalyzer } from '../types/analyzer.interface';\nimport { AnalyzerType } from '../types/analyzer-type.enum';" "$file_path"
        echo "   ✅ Added IAnalyzer imports"
    fi

    # Check if implements IAnalyzer
    if grep -q "implements IAnalyzer" "$file_path"; then
        echo "   ✅ Already implements IAnalyzer"
    else
        # Add implements IAnalyzer to class declaration
        sed -i "s/export class ${class_name}AnalyzerNew {/export class ${class_name}AnalyzerNew implements IAnalyzer {/" "$file_path"
        echo "   ✅ Added IAnalyzer implementation"
    fi

done

echo ""
echo "===================================================================="
echo "✅ Script completed. Run 'npm run build' to check for errors"
