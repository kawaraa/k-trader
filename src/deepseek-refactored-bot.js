// Technical Analysis Functions
class TechnicalAnalysis {
  static simpleMovingAverage(prices, period) {
    if (period < 1 || period > prices.length) {
      throw new Error("Invalid period. Must be between 1 and the length of the prices array.");
    }

    const sma = [];
    for (let i = 0; i <= prices.length - period; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += prices[i + j];
      }
      sma.push(sum / period);
    }

    const lastPrice = prices[prices.length - 1];
    const lastSMA = sma[sma.length - 1]; // the average of recent prices
    return lastPrice > lastSMA ? "buy" : "sell";
  }

  static calculateRSI(prices, period = 14) {
    if (prices.length < period) throw new Error("Not enough data to calculate RSI.");

    let gains = 0;
    let losses = 0;

    // Calculate initial gains and losses for the first `period` prices
    for (let i = 1; i < period; i++) {
      const difference = prices[i] - prices[i - 1];
      if (difference > 0) {
        gains += difference;
      } else {
        losses -= difference; // Absolute value of the loss
      }
    }

    // Initial average gain and loss
    let averageGain = gains / period;
    let averageLoss = losses / period;

    // Store the final RSI
    let rsi = 0;

    // Now calculate RSI for each subsequent price
    for (let i = period; i < prices.length; i++) {
      const difference = prices[i] - prices[i - 1];
      const gain = difference > 0 ? difference : 0;
      const loss = difference < 0 ? -difference : 0;

      // Apply exponential smoothing to the average gain and loss
      averageGain = (averageGain * (period - 1) + gain) / period;
      averageLoss = (averageLoss * (period - 1) + loss) / period;

      // Calculate relative strength (RS)
      const rs = averageLoss === 0 ? 100 : averageGain / averageLoss;

      // Calculate RSI using the relative strength (RS)
      rsi = 100 - 100 / (1 + rs);
    }

    return +rsi.toFixed(2);
  }

  static isVolumeRising(data) {
    if (!data || data.length < 1) return false;
    const vols = data.map((d) => d.volume);
    for (let i = 1; i < vols.length; i++) {
      if (vols[i] < vols[i - 1]) return false; // if any volume drops, not rising
    }
    return true;
  }

  static findSupportResistance(data) {
    if (!data || data.length < 10) return { supports: [], resistances: [] };
    const currentPrice = data[data.length - 1].close;

    // Volume-based filtering
    const avgVolume = data.reduce((sum, d) => sum + d.volume, 0) / data.length;
    const validData = data.filter((d) => d.volume > avgVolume);

    // Dynamic precision rounding
    const roundToPrecision = (value) => {
      const precision = currentPrice > 100 ? 0.1 : 0.001;
      return parseFloat(value.toFixed(precision.toString().length - 2));
    };

    const findSignificantLevels = (levels) => {
      const levelMap = new Map();
      levels.forEach((level) => {
        const rounded = roundToPrecision(level);
        levelMap.set(rounded, (levelMap.get(rounded) || 0) + 1);
      });
      return Array.from(levelMap.entries())
        .filter(([level, count]) => count >= 2 && Math.abs(level - currentPrice) <= currentPrice * 0.02)
        .map(([level]) => level)
        .sort((a, b) => a - b);
    };

    return {
      supports: findSignificantLevels(validData.map((d) => d.low)),
      resistances: findSignificantLevels(validData.map((d) => d.high)),
      currentPrice,
    };
  }

  static detectCandlestickPattern(data) {
    if (!Array.isArray(data) || data.length < 3) return "none";

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
      lastMetrics.lowerWick >= lastMetrics.bodySize * 2 &&
      lastMetrics.upperWick <= lastMetrics.bodySize * 0.5;

    const isInvertedHammer =
      lastMetrics.upperWick >= lastMetrics.bodySize * 2 &&
      lastMetrics.lowerWick <= lastMetrics.bodySize * 0.5;

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

  static detectTrend(data) {
    // Linear regression slope calculation
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

    // Dynamic volatility-adjusted threshold
    const volatility = Math.max(...data.map((d) => d.high)) - Math.min(...data.map((d) => d.low));
    const normalizedVolatility = volatility / data[0].close;
    const threshold = 0.003 * (1 + Math.log1p(normalizedVolatility * 100));

    // Asymmetric trend confirmation
    const isUptrend = lowSlope > threshold && highSlope > threshold / 2;
    const isDowntrend = highSlope < -threshold && lowSlope < -threshold / 2;

    return isUptrend ? "uptrend" : isDowntrend ? "downtrend" : "sideways";
  }

  static linearRegression(data) {
    if (!data || data.length < 2) return { trend: "none", slope: 0, intercept: 0, r2: 0 };

    const xValues = Array.from({ length: data.length }, (_, i) => i);

    const n = xValues.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += xValues[i];
      sumY += data[i];
      sumXY += xValues[i] * data[i];
      sumXX += xValues[i] * xValues[i];
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate R-squared
    let ssTot = 0,
      ssRes = 0;
    const meanY = sumY / n;

    for (let i = 0; i < n; i++) {
      const predicted = slope * xValues[i] + intercept;
      ssTot += Math.pow(data[i] - meanY, 2);
      ssRes += Math.pow(data[i] - predicted, 2);
    }

    const r2 = 1 - ssRes / ssTot;

    return {
      trend: slope > 0 ? "uptrend" : slope < 0 ? "downtrend" : "sideways",
      slope: slope,
      intercept: intercept,
      r2: r2,
      strength: r2 > 0.7 ? "strong" : r2 > 0.4 ? "moderate" : "weak",
    };
  }

  // Please review this version and compare it with the following version.
  // static detectTrendlines(data, pivotCount = 3) {
  //   const pivots = { support: [], resistance: [] };

  //   // Find swing points (simplified version)
  //   for (let i = 2; i < data.length - 2; i++) {
  //     const isSupport = data[i].low < data[i - 1].low && data[i].low < data[i + 1].low;
  //     const isResistance = data[i].high > data[i - 1].high && data[i].high > data[i + 1].high;

  //     if (isSupport) pivots.support.push({ ...data[i], idx: i });
  //     if (isResistance) pivots.resistance.push({ ...data[i], idx: i });
  //   }

  //   // Filter for the most recent N pivots
  //   return {
  //     support: pivots.support.slice(-pivotCount),
  //     resistance: pivots.resistance.slice(-pivotCount),
  //   };
  // }

  // with this version
  static detectTrendlines(data, pivotCount = 3, strictness = 2) {
    const pivots = { support: [], resistance: [] };

    // Find swing points with adjustable strictness
    for (let i = strictness; i < data.length - strictness; i++) {
      const isSupport = Array.from(
        { length: strictness },
        (_, n) => data[i].low < data[i - n - 1].low && data[i].low < data[i + n + 1].low
      ).every(Boolean);

      const isResistance = Array.from(
        { length: strictness },
        (_, n) => data[i].high > data[i - n - 1].high && data[i].high > data[i + n + 1].high
      ).every(Boolean);

      if (isSupport)
        pivots.support.push({
          price: data[i].low,
          index: i,
          time: data[i].time,
          confirmation: strictness, // Track how many candles confirm this pivot
        });

      if (isResistance)
        pivots.resistance.push({
          price: data[i].high,
          index: i,
          time: data[i].time,
          confirmation: strictness,
        });
    }

    // Sort by most recent first, then filter by pivotCount
    return {
      support: pivots.support.sort((a, b) => b.index - a.index).slice(0, pivotCount),
      resistance: pivots.resistance.sort((a, b) => b.index - a.index).slice(0, pivotCount),
    };
  }

  static isTrendlineValid(points) {
    if (points.length < 2) return false;

    const regression = TechnicalAnalysis.linearRegression(points);
    return Math.abs(regression.slope) > 0.005 && regression.r2 > 0.4;
  }

  static detectVolumeDivergence(candles) {
    if (!candles || candles.length < 10) return "neutral";

    const first = candles[0];
    const last = candles.at(-1);

    // Price direction
    const priceChange = last.close - first.close;
    const priceDirection = priceChange >= 0 ? "up" : "down";

    // Volume direction
    const volumeMA = simpleMovingAverage(
      candles.map((it) => it.volume),
      Math.floor(candles.length / 2),
      "volume"
    );
    const currentVolume = last.volume;
    const volumeDirection = currentVolume > volumeMA ? "up" : "down";

    // Divergence detection
    if (priceDirection === "up" && volumeDirection === "down") return "weak-uptrend";
    if (priceDirection === "down" && volumeDirection === "down") return "weak-downtrend";
    if (priceDirection === "up" && volumeDirection === "up") return "strong-uptrend";
    if (priceDirection === "down" && volumeDirection === "up") return "strong-downtrend";

    return "neutral";
  }
}

// Main Trading Class
export default class AdvancedTrader {
  constructor() {
    this.rsi = [];
  }

  async run() {
    try {
      // Fetch market data
      const ohlc = await fetch();
      /* I take care of data fetching
      Consider ohlc to be an array in the following shape:
      [{
        time: 0.287928,
        open: 0.287928,
        high: 0.287928,
        low: 0.287928,
        close: 0.287928,
        volume: 0.287928,
      }, {
        time: 0.287928,
        open: 0.287928,
        high: 0.287928,
        low: 0.287928,
        close: 0.287928,
        volume: 0.287928,
      }]
      */

      // Validate data
      if (!ohlc || ohlc.length < 10) {
        return `Insufficient historical data: ${ohlc?.length || 0} points`;
      }

      // Calculate indicators
      this.rsi.push(calculateRSI(ohlc.map((d) => d.close)));
      if (this.rsi.length < 2) this.rsi.push(this.rsi[0]);
      else if (this.rsi.length > 2) this.rsi.shift();

      // Make trading decision
      const decision = this.analyzeMarket(ohlc, currentRSI);

      // Execute trade if conditions met, I take care of the order Execution
      if (decision == "BUY") console.log("Placing BUY");
      else if (decision == "SELL") console.log("Placing SELL");
    } catch (error) {
      console.log(`ERROR in run cycle: ${error.message}`);
    }
  }

  analyzeMarket(ohlc) {
    const data = ohlc.slice(0, -1); // Ignore last open candle
    const last = data.at(-1);
    const prev = data.at(-2);
    const currentRSI = this.rsi.at(-1);
    const prevRSI = this.rsi.at(-2);

    // Technical indicators
    const { support, resistance } = TechnicalAnalysis.findSupportResistance(data.slice(-20));
    const pattern = TechnicalAnalysis.detectCandlestickPattern(data);
    const trend = TechnicalAnalysis.detectTrend(data.slice(-30));
    const volumeDivergence = TechnicalAnalysis.detectVolumeDivergence(data.slice(-8));
    const volumeRising = TechnicalAnalysis.isVolumeRising(data.slice(-4));
    const closeRegression = TechnicalAnalysis.linearRegression(data.slice(-15).map((it) => it.close));

    // Then modify your analyzeMarket to use them:
    const trendlines = TechnicalAnalysis.detectTrendlines(data, 3, 2);
    const validResistance = TechnicalAnalysis.isTrendlineValid(trendlines.resistance.map((it) => it.high));
    const validSupport = TechnicalAnalysis.isTrendlineValid(trendlines.support.map((it) => it.high));

    // Add to your scoring:
    if (validResistance && last.close > Math.max(...trendlines.resistance.map((t) => t.high))) {
      score.breakout += 2; // Strong weight for trendline breakout
    }

    // Calculate scores
    const score = { breakout: 0, breakdown: 0 };

    if (last.close > resistance) score.breakout += 2;
    if (pattern === "bullish-engulfing")
      score.breakout += last.close > support && last.close < support * 1.02 ? 2 : 1;
    if (pattern === "hammer" && last.close > last.open && prev.low < support) score.breakout += 2;
    if (pattern === "morning-star" && prev.close < support && last.close > support) score.breakout += 3;
    if (trend === "uptrend" && volumeDivergence === "strong-uptrend") score.breakout += 1;
    if (currentRSI > 52 && currentRSI - prevRSI > 2) score.breakout += 1;
    if (currentRSI > 55 && currentRSI - prevRSI > 5) score.breakout += 1;

    if (closeRegression.strength === "strong" && closeRegression.slope > 0) {
      score.breakout += 1; // Add points for strong upward trend
    }

    if (last.close < support) score.breakdown += 2;
    if (["dark-cloud-cover", "bearish-engulfing"].includes(pattern)) {
      score.breakdown += last.close < resistance && last.close > resistance * 0.98 ? 2 : 1;
    }
    if (pattern === "shooting-star" && last.close < last.open && last.high > resistance) score.breakdown += 2;
    if (pattern === "evening-star") score.breakdown += 2;
    if (trend === "downtrend" && volumeDivergence === "strong-downtrend") score.breakdown += 1;
    if (currentRSI < 48 && prevRSI - currentRSI > 2) score.breakdown += 1;
    if (currentRSI < 45 && prevRSI - currentRSI > 5) score.breakdown += 1;
    if (closeRegression.strength === "strong" && closeRegression.slope < 0) {
      score.breakdown += 1; // Add points for strong upward trend
    }

    // Add to your scoring:
    if (validSupport && last.close < Math.max(...trendlines.support.map((t) => t.high))) {
      score.breakdown += 2; // Strong weight for trendline breakdown
    }

    if (volumeRising) {
      score.breakout += 1;
      score.breakdown += 1;
    }

    // score.breakout += rsiSignal === "bullish" ? 1 : 0;
    // score.breakdown += rsiSignal === "bearish" ? 1 : 0;

    // Make final decision
    if (score.breakout >= 5) return "BUY";
    if (score.breakdown >= 5) return "SELL";
    return "HOLD";
  }
}
