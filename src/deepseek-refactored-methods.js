function isVolumeRising(data) {
  if (!data || data.length < 1) return false;
  const vols = data.map((d) => d.volume);
  for (let i = 1; i < vols.length; i++) {
    if (vols[i] < vols[i - 1]) return false; // if any volume drops, not rising
  }
  return true;
}

function findSupportResistance(data) {
  if (!data || data.length < 10) return { supports: [], resistances: [] }; // Min 6h data
  const currentPrice = data[data.length - 1].close;

  // Filter levels with above-average volume
  const avgVolume = data.reduce((sum, d) => sum + d.volume, 0) / data.length;
  const validData = data.filter((d) => d.volume > avgVolume);

  // === 4. Level Clustering & Significance Checks ===
  // Round to 0.1% of price to cluster nearby levels
  const roundToPrecision = (value) => {
    const precision = currentPrice > 100 ? 0.1 : 0.001; // Adjust for asset price scale
    return parseFloat(value.toFixed(precision.toString().length - 2));
  };

  const findSignificantLevels = (levels) => {
    const levelMap = new Map();

    // Group nearby levels and count occurrences
    levels.forEach((level) => {
      const rounded = roundToPrecision(level);
      levelMap.set(rounded, (levelMap.get(rounded) || 0) + 1);
    });

    // Filter levels with ≥2 touches AND within 2% of current price
    return Array.from(levelMap.entries())
      .filter(([level, count]) => count >= 2 && Math.abs(level - currentPrice) <= currentPrice * 0.02)
      .map(([level]) => level)
      .sort((a, b) => a - b);
  };

  // === 5. Return Validated Levels ===
  return {
    supports: findSignificantLevels(validData.map((d) => d.low)),
    resistances: findSignificantLevels(validData.map((d) => d.high)),
    currentPrice, // Optional: Useful for distance checks
  };
}

/**
 * Detects candlestick patterns from Kraken 5-minute OHLC data.
 * @param {Array} data - OHLC candles (expected: { open, high, low, close }).
 * @returns {string} - Pattern name or "none".
 */
function detectCandlestickPattern(data) {
  // === 1. Input Validation ===
  if (!Array.isArray(data) || data.length < 3) {
    console.error("Invalid data: Expected array with ≥3 candles.");
    return "none";
  }

  // === 2. Extract Candles Safely ===
  const [prevPrev, prev, last] = data.slice(-3); // Destructure for clarity
  if ([prevPrev, prev, last].some((c) => !c || typeof c.close !== "number")) {
    console.error("Malformed candle data.");
    return "none";
  }

  // === 3. Candle Anatomy Calculations ===
  const getCandleMetrics = (candle) => {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.close, candle.open);
    const lowerWick = Math.min(candle.close, candle.open) - candle.low;
    const totalRange = candle.high - candle.low;
    return { bodySize, upperWick, lowerWick, totalRange };
  };

  const lastMetrics = getCandleMetrics(last);
  const prevMetrics = getCandleMetrics(prev);
  const prevPrevMetrics = getCandleMetrics(prevPrev);

  // === 4. Pattern Definitions (with Strict Checks) ===
  const isBullishEngulfing =
    prev.close < prev.open &&
    last.close > last.open &&
    last.close >= prev.open && // >= to handle edge cases
    last.open <= prev.close;

  const isBearishEngulfing =
    prev.close > prev.open && last.close < last.open && last.open >= prev.close && last.close <= prev.open;

  const isHammer =
    lastMetrics.lowerWick >= lastMetrics.bodySize * 2 && lastMetrics.upperWick <= lastMetrics.bodySize * 0.5;

  const isInvertedHammer =
    lastMetrics.upperWick >= lastMetrics.bodySize * 2 && lastMetrics.lowerWick <= lastMetrics.bodySize * 0.5;

  const isShootingStar = isInvertedHammer && last.close < last.open;

  const isDoji = lastMetrics.bodySize <= lastMetrics.totalRange * 0.1; // Strict Doji threshold

  // === 5. Advanced Patterns (Volume-Weighted) ===
  const isMorningStar =
    prevPrev.close > prevPrev.open &&
    prev.close < prev.open &&
    last.close > last.open &&
    last.close > (prevPrev.open + prevPrev.close) / 2 &&
    prevMetrics.bodySize > prevPrevMetrics.bodySize * 0.7;

  const isEveningStar =
    prevPrev.close < prevPrev.open &&
    prev.close > prev.open &&
    last.close < last.open &&
    last.close < (prevPrev.open + prevPrev.close) / 2 &&
    prevMetrics.bodySize > prevPrevMetrics.bodySize * 0.7;

  // === 6. Pattern Priority (Most Significant First) ===
  const patterns = [
    { condition: isMorningStar, name: "morning-star" },
    { condition: isEveningStar, name: "evening-star" },
    { condition: isBullishEngulfing, name: "bullish-engulfing" },
    { condition: isBearishEngulfing, name: "bearish-engulfing" },
    { condition: isDarkCloudCover, name: "dark-cloud-cover" },
    { condition: isPiercing, name: "piercing" },
    { condition: isShootingStar, name: "shooting-star" },
    { condition: isHammer, name: "hammer" },
    { condition: isInvertedHammer, name: "inverted-hammer" },
    { condition: isDoji, name: "doji" },
  ];

  // Return the highest-priority matched pattern
  return patterns.find((p) => p.condition)?.name || "none";
}

function detectTrend(data, baseFlatThreshold = 0.003) {
  // === 1. Input Validation ===
  if (!Array.isArray(data) || data.length < 10) return "sideways";

  // === 2. Calculate Slopes (Linear Regression) ===
  const n = data.length;
  let sumX = 0,
    sumYHigh = 0,
    sumYLow = 0,
    sumXYHigh = 0,
    sumXYLow = 0,
    sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumYHigh += data[i].high;
    sumYLow += data[i].low;
    sumXYHigh += i * data[i].high;
    sumXYLow += i * data[i].low;
    sumX2 += i * i;
  }

  const highSlope = (n * sumXYHigh - sumX * sumYHigh) / (n * sumX2 - sumX * sumX);
  const lowSlope = (n * sumXYLow - sumX * sumYLow) / (n * sumX2 - sumX * sumX);

  // === 3. Dynamic Threshold Calculation ===
  const volatility = Math.max(...data.map((d) => d.high)) - Math.min(...data.map((d) => d.low));
  const normalizedVolatility = volatility / data[0].close; // As percentage of price
  const dynamicThreshold = baseFlatThreshold * (1 + Math.log1p(normalizedVolatility * 100));

  // === 4. Trend Classification ===
  const isUptrend = lowSlope > dynamicThreshold && highSlope > dynamicThreshold / 2; // Allow weaker highs in uptrends

  const isDowntrend =
    lowSlope < -dynamicThreshold / 2 && // Allow weaker lows in downtrends
    highSlope < -dynamicThreshold;

  return isUptrend ? "uptrend" : isDowntrend ? "downtrend" : "sideways";
}
