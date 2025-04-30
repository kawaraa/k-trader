const Trader = require("./trader");
const fixNum = (n) => +n.toFixed(2);

class AdvanceTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.position = null;
    this.decisions = ["HOLD"];
    this.rsi = [];
  }

  async run() {
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = this.testMode ? this.position : (await this.ex.getOrders(this.pair))[0];
    const currentPrice = await this.ex.currentPrices(this.pair); // { tradePrice, askPrice, bidPrice }
    const ohlc = await this.ex.pricesData(this.pair, this.interval); // Returns 720 item (720 * 5 / 60 = 60hrs)

    const closes = ohlc.map((d) => d.close);
    this.rsi.push(TechnicalAnalysis.calculateRSI(closes, this.rsiPeriod).value);
    if (this.rsi.length < 2) this.rsi.push(this.rsi[0]);
    if (this.rsi.length > 2) this.rsi.shift();

    const decision = this.analyzeMarket(ohlc);
    if (decision !== "HOLD") this.decisions.push(decision);
    if (this.decisions.length > 1) this.decisions.shift();

    const log = this.testMode ? "TEST:" : "";

    if (this.decisions.every((d) => d === "BUY")) {
      this.dispatch("LOG", `${log} [+] Breakout detected.`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      if (!position) await this.placeOrder("BUY", capital, currentPrice.askPrice);
      //
    } else if (this.decisions.every((d) => d === "SELL")) {
      this.dispatch("LOG", `${log} [-] Breakdown detected.`);
      if (position) await this.placeOrder("SELL", balance.crypto, currentPrice.bidPrice, position);
    } else {
      this.dispatch("LOG", `${log} [=] No trade signal. decision: ${this.decisions.join("-")}`);
    }
  }

  // ===== breakout breakdown based Strategy
  analyzeMarket(ohlc) {
    // Data preparation with more context
    const data = ohlc.slice(0, -1); // Ignore last open candle
    const last = data.at(-1);
    const prev = data.at(-2);
    const currentRSI = this.rsi.at(-1);
    const prevRSI = this.rsi.at(-2);

    // Calculate market volatility (ATR-like measure)
    const volatility = TechnicalAnalysis.calculateVolatility(data.slice(-24));
    const isHighVolatility = volatility > last.close * 0.015;

    const { supports, resistances } = TechnicalAnalysis.findSupportResistance(data.slice(-50));
    const support = supports[0]?.price ?? null;
    const resistance = resistances[0]?.price ?? null;

    const { pattern, reliability } = TechnicalAnalysis.detectCandlestickPattern(data);
    const { trend, crossover } = TechnicalAnalysis.detectTrend(data.slice(-30));
    const closeRegression = TechnicalAnalysis.linearRegression(data.slice(-15).map((it) => it.close));
    const trendlines = TechnicalAnalysis.detectTrendlines(data);
    const volumeDivergence = TechnicalAnalysis.detectVolumeDivergence(data.slice(-10));
    const volumeRising = TechnicalAnalysis.analyzeVolume(data.slice(-6));

    const validResistance = TechnicalAnalysis.isTrendlineValid(trendlines.resistances.map((it) => it.price));
    const validSupport = TechnicalAnalysis.isTrendlineValid(trendlines.supports.map((it) => it.price));

    const avgVolume = data.slice(-6).reduce((sum, d) => sum + d.volume, 0) / 6;

    // Breakout confirmation conditions
    const resistanceBreakoutConfirmed =
      last.close > resistance && last.close > last.open + (last.high - last.low) * 0.7;
    const supportBreakdownConfirmed =
      last.close < support && last.close < last.open + (last.high - last.low) * 0.3;

    // Trendline breakout conditions with confirmation
    const resistanceTrendlineBreakout =
      validResistance &&
      last.close > Math.max(...trendlines.resistances.map((t) => t.price)) &&
      last.close > last.open &&
      last.volume > data.slice(-5).reduce((a, b) => a + b.volume, 0) / 5;

    const supportTrendlineBreakdown =
      validSupport &&
      last.close < Math.min(...trendlines.supports.map((t) => t.price)) &&
      last.close < last.open &&
      last.volume > data.slice(-5).reduce((a, b) => a + b.volume, 0) / 5;

    // Calculate scores with volatility adjustment
    const baseScore = isHighVolatility ? 5 : 4; // Require higher confidence in volatile markets
    const score = { breakout: 0, breakdown: 0 };

    // Breakout scoring (more conservative in high volatility)
    if (resistanceBreakoutConfirmed) score.breakout += isHighVolatility ? 1.5 : 2;
    if (resistanceTrendlineBreakout) score.breakout += isHighVolatility ? 1.5 : 2.5;

    if (pattern === "bullish-engulfing") {
      const nearSupport = last.close >= support && last.close <= support * 1.01;
      score.breakout += nearSupport ? (isHighVolatility ? 2 : 1.5) : 1;
    }

    if (pattern === "hammer" && last.close > last.open && prev.low < support) {
      score.breakout += isHighVolatility ? 2 : 1;
    }

    if (pattern === "morning-star" && prev.close < support && last.close > support) {
      score.breakout += isHighVolatility ? 3 : 2;
    }

    // Bullish patterns
    if (
      [
        "dragonfly-doji",
        "inverted-hammer",
        "bullish-harami",
        "piercing-line",
        "three-white-soldiers",
        "three-inside-up",
      ].includes(pattern)
    ) {
      if (last.close > support && last.close > last.open && isHighVolatility) score.breakout += 2;
      else score.breakout += isHighVolatility ? 1.5 : 1;
    }

    if (trend === "strong-up") {
      if (volumeDivergence === "strong-uptrend") score.breakout += 1.5;
      else if (volumeDivergence === "weak-uptrend") score.breakout -= 0.5; // Penalize weak volume
    }

    // RSI scoring with trend context
    if (trend === "strong-up" || trend === "sideways") {
      if (currentRSI > 50 && currentRSI - prevRSI > 3) score.breakout += 1;
      if (currentRSI > 55 && currentRSI - prevRSI > 5) score.breakout += 1.5;
    }

    if (closeRegression.strength === "strong" && closeRegression.slope > 0) {
      score.breakout += isHighVolatility ? 1 : 0.5;
    }

    // Breakdown scoring
    if (supportBreakdownConfirmed) {
      const breakdownDistance = (support - last.close) / support;
      let breakdownWeight = isHighVolatility ? 2 : 1.5;
      if (breakdownDistance > 0.01) breakdownWeight *= 1.5; // 1%+ breakdown
      if (breakdownDistance > 0.02) breakdownWeight *= 2; // 2%+ breakdown
      score.breakdown += breakdownWeight;
    }

    if (supportTrendlineBreakdown) score.breakdown += isHighVolatility ? 2.5 : 1.5;

    if (["dark-cloud-cover", "bearish-engulfing"].includes(pattern)) {
      const nearResistance = last.close < resistance && last.close > resistance * 0.99;
      score.breakdown += nearResistance ? (isHighVolatility ? 1.5 : 2) : 1;
    }

    if (pattern === "shooting-star" && last.close < last.open && last.high > resistance) {
      score.breakdown += isHighVolatility ? 2 : 1;
    }

    if (pattern === "evening-star") {
      score.breakdown += isHighVolatility ? 3 : 2;
    }
    // Bearish patterns
    if (
      ["gravestone-doji", "hanging-man", "bearish-harami", "three-black-crows", "three-inside-down"].includes(
        pattern
      )
    ) {
      if (last.close < resistance && last.close < last.open && isHighVolatility) score.breakdown += 2;
      else score.breakdown += isHighVolatility ? 1.5 : 1;
    }
    if (trend === "strong-down") {
      if (volumeDivergence === "strong-downtrend") score.breakdown += 2;
      else if (volumeDivergence === "weak-downtrend") score.breakdown -= 0.5;
    }

    // RSI scoring with trend context
    if (trend === "strong-down" || trend === "sideways") {
      if (currentRSI < 50 && prevRSI - currentRSI > 3) score.breakdown += 1;
      if (currentRSI < 45 && prevRSI - currentRSI > 5) score.breakdown += 2;

      // After (More responsive to oversold conditions)
      if (prevRSI < 30) {
        score.breakdown += 2;
        if (prevRSI > currentRSI) score.breakdown += 1; // Continuing downward
      }
    }

    if (closeRegression.strength === "strong" && closeRegression.slope < 0) {
      score.breakdown += isHighVolatility ? 1 : 0.5;
    }

    if (volumeRising === "strong-rise") {
      // Bullish volume confirmation
      if (trend === "strong-up") {
        score.breakout += 2; // Strong trend alignment
      } else if (trend === "sideways") {
        score.breakout += 1.5; // Potential breakout
      } else {
        score.breakout += 0.5; // Counter-trend warning
      }
      // Penalize breakdowns during rising volume
      score.breakdown = Math.max(0, score.breakdown - 1);
    }

    if (volumeRising === "strong-fall") {
      // Bearish volume confirmation
      if (trend === "strong-down") {
        score.breakdown += 2; // Strong trend alignment
      } else if (trend === "sideways") {
        score.breakdown += 1.5; // Potential breakdown
      } else {
        score.breakdown += 0.5; // Counter-trend warning
      }
      // Penalize breakouts during falling volume
      score.breakout = Math.max(0, score.breakout - 1);
    }

    // Moderate volume changes
    if (volumeRising === "moderate-rise") score.breakout += 0.5;
    if (volumeRising === "moderate-fall") score.breakdown += 0.5;

    // Final decision with dynamic threshold and confirmation
    const breakoutConfirmed =
      score.breakout >= baseScore && (resistanceBreakoutConfirmed || resistanceTrendlineBreakout);

    const breakdownConfirmed =
      score.breakdown >= baseScore && (supportBreakdownConfirmed || supportTrendlineBreakdown);

    const decision = breakoutConfirmed ? "BUY" : breakdownConfirmed ? "SELL" : "HOLD";

    // === Debug Logs ===
    this.dispatch("LOG", `\n=== Decision Debug based on scoring system ===`);
    this.dispatch("LOG", `Last Close: ${fixNum(last.close)}`);
    this.dispatch(
      "LOG",
      `Volume (Prev): ${fixNum(prev.volume)} (Last): ${fixNum(last.volume)} (Avg): ${fixNum(avgVolume)}`
    );
    this.dispatch("LOG", `RSI (Prev): ${prevRSI} (Last): ${currentRSI}`);
    this.dispatch("LOG", `Pattern: ${pattern} - reliability: ${reliability}`);
    this.dispatch("LOG", `Trend: ${trend} - crossover: ${crossover}`);
    this.dispatch("LOG", `Slope Trend: ${closeRegression.slope} - ${closeRegression.strength}`);
    this.dispatch("LOG", `Support: ${support} Resistance: ${resistance}`);
    this.dispatch("LOG", `Valid Support Line: ${validSupport}`);
    this.dispatch("LOG", `Valid Resistance Line: ${validResistance}`);
    this.dispatch("LOG", `Resistance Breakout Confirmed: ${resistanceBreakoutConfirmed}`);
    this.dispatch("LOG", `Support Breakdown Confirmed: ${supportBreakdownConfirmed}`);
    this.dispatch("LOG", `Resistance Trendline Breakout: ${resistanceTrendlineBreakout}`);
    this.dispatch("LOG", `Support Trendline Breakdown: ${supportTrendlineBreakdown}`);
    this.dispatch("LOG", `Score (breakout): ${score.breakout} (breakdown): ${score.breakdown}  `);
    this.dispatch("LOG", `Decision: ${decision}`);
    this.dispatch("LOG", `======================`);

    return decision;
  }
}

module.exports = AdvanceTrader;

// Technical Analysis Functions
class TechnicalAnalysis {
  // Enhanced SMA with better performance
  static simpleMovingAverage(data, period = 14) {
    if (!data || data.length < period) return null;

    const sma = [];
    for (let i = 0; i <= data.length - period; i++) {
      const slice = data.slice(i, i + period);
      const avg = slice.reduce((sum, val) => sum + val, 0) / period;
      sma.push(avg);
    }

    const len = sma.length;
    let slope = 0;
    let trend = "sideways";

    if (len >= 2) {
      const delta = sma[len - 1] - sma[len - 2];
      slope = delta;

      if (slope > 0) trend = "bullish";
      else if (slope < 0) trend = "bearish";
    }

    return { values: sma, slope, trend };
  }

  // Improved RSI using Wilder's smoothing
  static calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return null;

    let avgGain = 0;
    let avgLoss = 0;

    // Initial averages
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      avgGain += Math.max(change, 0);
      avgLoss += Math.abs(Math.min(change, 0));
    }

    avgGain /= period;
    avgLoss /= period;

    for (let i = period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      const gain = Math.max(change, 0);
      const loss = Math.abs(Math.min(change, 0));

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    const rs = avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);

    return {
      value: parseFloat(rsi.toFixed(2)),
      trend: rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : "neutral",
      momentum: avgGain - avgLoss,
    };
  }
  static findSupportResistance(data, clusterThreshold = 0.005) {
    if (!data || data.length < 10) return { supports: [], resistances: [] };

    const currentPrice = data[data.length - 1].close;

    // Improved precision calculation for different asset classes
    const precision = currentPrice > 1000 ? 0 : currentPrice > 10 ? 1 : currentPrice > 1 ? 2 : 4;

    // More robust rounding function
    const roundPrice = (price) => {
      const factor = Math.pow(10, precision);
      return Math.round(price * factor) / factor;
    };

    // Enhanced clustering algorithm
    const clusterLevels = (levels, isSupport) => {
      if (levels.length === 0) return [];

      const sorted = [...levels].sort((a, b) => a - b);
      const clusters = [];
      let currentCluster = [];

      // Dynamic threshold based on average price volatility
      const priceChanges = data.slice(-14).map((d) => Math.abs(d.close - d.open));
      const avgVolatility = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
      const dynamicThreshold = Math.max(avgVolatility * 0.5, currentPrice * clusterThreshold);

      sorted.forEach((price, i) => {
        price = roundPrice(price);

        if (currentCluster.length === 0) {
          currentCluster.push(price);
        } else {
          const lastPrice = currentCluster[currentCluster.length - 1];
          if (Math.abs(price - lastPrice) <= dynamicThreshold) {
            currentCluster.push(price);
          } else {
            clusters.push(currentCluster);
            currentCluster = [price];
          }
        }
      });

      if (currentCluster.length > 0) clusters.push(currentCluster);

      return clusters
        .filter((c) => c.length >= 1) // Reduced minimum cluster size
        .map((c) => {
          const avgPrice = c.reduce((a, b) => a + b, 0) / c.length;
          const touches = data.filter(
            (d) => Math.abs((isSupport ? d.low : d.high) - avgPrice) <= dynamicThreshold
          ).length;

          const recentTouches = data
            .slice(-24)
            .filter((d) => Math.abs((isSupport ? d.low : d.high) - avgPrice) <= dynamicThreshold).length;

          const strength = touches * 0.6 + recentTouches * 0.4;

          return {
            price: roundPrice(avgPrice),
            strength: parseFloat(strength.toFixed(2)),
            touches,
            recentTouches,
          };
        })
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5); // Return top 5 strongest levels
    };

    return {
      supports: clusterLevels(
        data.map((d) => d.low),
        true
      ),
      resistances: clusterLevels(
        data.map((d) => d.high),
        false
      ),
    };
  }

  // Enhanced candlestick pattern detection
  static detectCandlestickPattern(data) {
    if (!Array.isArray(data) || data.length < 5) return { pattern: "insufficient-data", reliability: 0 };

    const [prev3, prev2, prev, current] = data.slice(-4);
    const patterns = [];

    // Enhanced helper functions
    const bodySize = (candle) => Math.abs(candle.close - candle.open);
    const totalRange = (candle) => candle.high - candle.low;
    const upperWick = (candle) => candle.high - Math.max(candle.open, candle.close);
    const lowerWick = (candle) => Math.min(candle.open, candle.close) - candle.low;
    const isBullish = (candle) => candle.close > candle.open;
    const isBearish = (candle) => candle.close < candle.open;
    const isSmallBody = (candle) => bodySize(candle) < totalRange(candle) * 0.25;
    const isLongWick = (wick, body) => wick > body * 2;
    const isMarubozu = (candle) => bodySize(candle) > totalRange(candle) * 0.9;

    // 1. Single Candle Patterns
    if (isSmallBody(current)) {
      // Doji variants
      if (bodySize(current) < totalRange(current) * 0.05) {
        if (upperWick(current) > totalRange(current) * 0.6) {
          patterns.push({ pattern: "gravestone-doji", reliability: 0.65 });
        } else if (lowerWick(current) > totalRange(current) * 0.6) {
          patterns.push({ pattern: "dragonfly-doji", reliability: 0.65 });
        } else {
          patterns.push({ pattern: "doji", reliability: 0.6 });
        }
      }
      // Hammer family
      else if (isLongWick(lowerWick(current), bodySize(current))) {
        patterns.push({
          pattern: isBullish(current) ? "hammer" : "hanging-man",
          reliability: isMarubozu(prev) ? 0.8 : 0.7,
        });
      }
      // Shooting star family
      else if (isLongWick(upperWick(current), bodySize(current))) {
        patterns.push({
          pattern: isBullish(current) ? "inverted-hammer" : "shooting-star",
          reliability: isMarubozu(prev) ? 0.8 : 0.7,
        });
      }
    }

    // 2. Two-Candle Patterns
    if (data.length >= 2) {
      // Engulfing patterns
      if (isBearish(prev) && isBullish(current) && current.close > prev.open && current.open < prev.close) {
        const reliability = bodySize(prev) > totalRange(prev) * 0.7 ? 0.85 : 0.75;
        patterns.push({ pattern: "bullish-engulfing", reliability });
      }

      if (isBullish(prev) && isBearish(current) && current.open > prev.close && current.close < prev.open) {
        const reliability = bodySize(prev) > totalRange(prev) * 0.7 ? 0.85 : 0.75;
        patterns.push({ pattern: "bearish-engulfing", reliability });
      }

      // Harami patterns
      if (isBearish(prev) && isBullish(current) && current.close < prev.open && current.open > prev.close) {
        patterns.push({ pattern: "bullish-harami", reliability: 0.7 });
      }

      if (isBullish(prev) && isBearish(current) && current.open < prev.close && current.close > prev.open) {
        patterns.push({ pattern: "bearish-harami", reliability: 0.7 });
      }

      // Piercing/Dark Cloud
      if (
        isBearish(prev) &&
        isBullish(current) &&
        current.close > (prev.open + prev.close) / 2 &&
        current.open < prev.close
      ) {
        patterns.push({ pattern: "piercing-line", reliability: 0.75 });
      }

      if (
        isBullish(prev) &&
        isBearish(current) &&
        current.close < (prev.open + prev.close) / 2 &&
        current.open > prev.close
      ) {
        patterns.push({ pattern: "dark-cloud-cover", reliability: 0.75 });
      }
    }

    // 3. Three-Candle Patterns
    if (data.length >= 3) {
      // Star patterns
      if (
        isBearish(prev2) &&
        isSmallBody(prev) &&
        isBullish(current) &&
        current.close > (prev2.open + prev2.close) / 2 &&
        prev.low < Math.min(prev2.close, current.open)
      ) {
        patterns.push({ pattern: "morning-star", reliability: 0.9 });
      }

      if (
        isBullish(prev2) &&
        isSmallBody(prev) &&
        isBearish(current) &&
        current.close < (prev2.open + prev2.close) / 2 &&
        prev.high > Math.max(prev2.close, current.open)
      ) {
        patterns.push({ pattern: "evening-star", reliability: 0.9 });
      }

      // Three White Soldiers/Black Crows
      if (
        [prev2, prev, current].every(isBullish) &&
        current.close > prev.close &&
        prev.close > prev2.close &&
        current.open > prev.open &&
        prev.open > prev2.open
      ) {
        patterns.push({ pattern: "three-white-soldiers", reliability: 0.85 });
      }

      if (
        [prev2, prev, current].every(isBearish) &&
        current.close < prev.close &&
        prev.close < prev2.close &&
        current.open < prev.open &&
        prev.open < prev2.open
      ) {
        patterns.push({ pattern: "three-black-crows", reliability: 0.85 });
      }
    }

    // 4. Four-Candle Patterns
    if (data.length >= 4) {
      // Three Inside Up/Down
      if (
        isBearish(prev3) &&
        isBullish(prev2) &&
        prev2.close < (prev3.open + prev3.close) / 2 &&
        isBullish(prev) &&
        prev.close > prev2.high &&
        isBullish(current)
      ) {
        patterns.push({ pattern: "three-inside-up", reliability: 0.8 });
      }

      if (
        isBullish(prev3) &&
        isBearish(prev2) &&
        prev2.close > (prev3.open + prev3.close) / 2 &&
        isBearish(prev) &&
        prev.close < prev2.low &&
        isBearish(current)
      ) {
        patterns.push({ pattern: "three-inside-down", reliability: 0.8 });
      }
    }

    // Return the highest reliability pattern, or none if below threshold
    return patterns.length > 0
      ? patterns.sort((a, b) => b.reliability - a.reliability)[0]
      : { pattern: "none", reliability: 0 };

    // "gravestone-doji", "dragonfly-doji", "hammer", "hanging-man", "inverted-hammer", "shooting-star", "bullish-engulfing", "bearish-engulfing", "bullish-harami", "bearish-harami", "piercing-line", "dark-cloud-cover", "morning-star", "evening-star", "three-white-soldiers", "three-black-crows", "three-inside-up", "three-inside-down"
  }

  // Enhanced trend detection with ADX
  static detectTrend(data, period) {
    period = period ?? 14;

    // Validation
    if (!Array.isArray(data) || data.length < period + 1) return "insufficient-data";

    let plusDM = 0,
      minusDM = 0,
      trSum = 0;
    const dxValues = [];

    for (let i = 1; i <= period; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      const upMove = curr.high - prev.high;
      const downMove = prev.low - curr.low;

      plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
      minusDM += downMove > upMove && downMove > 0 ? downMove : 0;

      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      );
      trSum += tr;
    }

    const plusDI = trSum > 0 ? (plusDM / trSum) * 100 : 0;
    const minusDI = trSum > 0 ? (minusDM / trSum) * 100 : 0;

    const dx = plusDI + minusDI > 0 ? (Math.abs(plusDI - minusDI) / (plusDI + minusDI)) * 100 : 0;

    // Approximate ADX by averaging the DX values over the next `period` entries
    for (let i = period + 1; i < Math.min(data.length, period * 2); i++) {
      const prev = data[i - 1];
      const curr = data[i];

      const upMove = curr.high - prev.high;
      const downMove = prev.low - curr.low;

      const pdm = upMove > downMove && upMove > 0 ? upMove : 0;
      const mdm = downMove > upMove && downMove > 0 ? downMove : 0;

      const tr = Math.max(
        curr.high - curr.low,
        Math.abs(curr.high - prev.close),
        Math.abs(curr.low - prev.close)
      );

      const plusDIx = tr > 0 ? (pdm / tr) * 100 : 0;
      const minusDIx = tr > 0 ? (mdm / tr) * 100 : 0;

      const dxVal = plusDIx + minusDIx > 0 ? (Math.abs(plusDIx - minusDIx) / (plusDIx + minusDIx)) * 100 : 0;

      dxValues.push(dxVal);
    }

    const adx = dxValues.length > 0 ? (dx + dxValues.reduce((a, b) => a + b, 0)) / (dxValues.length + 1) : dx;

    const crossover = Math.abs(plusDI - minusDI) < 1 ? "neutral" : plusDI > minusDI ? "bullish" : "bearish";

    const trend =
      adx > 25
        ? plusDI > minusDI
          ? "strong-up"
          : "strong-down"
        : adx > 20
        ? plusDI > minusDI
          ? "moderate-up"
          : "moderate-down"
        : "sideways";

    return {
      trend,
      adx: parseFloat(adx.toFixed(2)),
      plusDI: parseFloat(plusDI.toFixed(2)),
      minusDI: parseFloat(minusDI.toFixed(2)),
      crossover,
    };
  }

  static linearRegression(data) {
    if (!data || data.length < 2) return { slope: 0, intercept: 0, r2: 0 };
    const formatDecimal = (n, decimals = 4) => parseFloat(n.toFixed(decimals));

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
      slope: formatDecimal(slope),
      intercept: formatDecimal(intercept),
      r2: formatDecimal(r2),
      strength: r2 > 0.7 ? "strong" : r2 > 0.4 ? "moderate" : "weak",
    };
  }

  static detectTrendlines(data) {
    if (!data || data.length < 5) return { supports: [], resistances: [] };

    const pivots = { supports: [], resistances: [] };

    // Find swing points with dynamic confirmation
    for (let i = 2; i < data.length - 2; i++) {
      const isSupport =
        data[i].low < data[i - 1].low &&
        data[i].low < data[i + 1].low &&
        data.slice(i - 2, i + 3).every((c) => c.low >= data[i].low); // Local minimum check

      const isResistance =
        data[i].high > data[i - 1].high &&
        data[i].high > data[i + 1].high &&
        data.slice(i - 2, i + 3).every((c) => c.high <= data[i].high); // Local maximum check

      if (isSupport)
        pivots.supports.push({
          price: data[i].low,
          index: i,
          time: data[i].time,
        });

      if (isResistance)
        pivots.resistances.push({
          price: data[i].high,
          index: i,
          time: data[i].time,
        });
    }

    // Return 3 strongest pivots (by recency and prominence)
    return {
      supports: pivots.supports.sort((a, b) => b.index - a.index).slice(0, 3),
      resistances: pivots.resistances.sort((a, b) => b.index - a.index).slice(0, 3),
    };
  }

  static isTrendlineValid(points) {
    if (points.length < 2) return false;
    const regression = TechnicalAnalysis.linearRegression(points);
    return Math.abs(regression.slope) > 0.005 && regression.r2 > 0.4;
  }

  static analyzeVolume(data) {
    if (!data || data.length < 5) return "insufficient-data";

    // Use both regression slope and MA deviation
    const volumes = data.map((d) => d.volume);

    // 1. Regression Analysis
    const regression = TechnicalAnalysis.linearRegression(volumes);

    // 2. Moving Average Analysis with Deviation
    const period = Math.max(3, Math.floor(data.length * 0.2));
    const maValues = TechnicalAnalysis.simpleMovingAverage(volumes, period).values;

    // Calculate standard deviation for the same period
    const deviations = [];
    for (let i = 0; i <= volumes.length - period; i++) {
      const slice = volumes.slice(i, i + period);
      const avg = maValues[i];
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / period;
      deviations.push(Math.sqrt(variance));
    }

    const currentVol = volumes.at(-1);
    const currentMA = maValues.at(-1);
    const currentDeviation = deviations.at(-1) || 0;

    // 3. Hybrid Signal Logic
    const isStrongSlope = Math.abs(regression.slope) > currentMA * 0.03;
    const isOverMA = currentVol > currentMA + currentDeviation;
    const isUnderMA = currentVol < currentMA - currentDeviation;

    if (isStrongSlope && regression.slope > 0) {
      return isOverMA ? "strong-rise" : "moderate-rise";
    }
    if (isStrongSlope && regression.slope < 0) {
      return isUnderMA ? "strong-fall" : "moderate-fall";
    }

    return "neutral";
  }

  static detectVolumeDivergence(candles) {
    if (!candles || candles.length < 10) return "neutral";

    const first = candles[0];
    const last = candles.at(-1);

    // Price direction
    const priceChange = last.close - first.close;
    const priceDirection = priceChange >= 0 ? "up" : "down";

    // Volume direction
    const volumeMA = TechnicalAnalysis.simpleMovingAverage(
      candles.map((it) => it.volume),
      Math.floor(candles.length / 2)
    ).values.at(-1);
    const currentVolume = last.volume;
    const volumeDirection = currentVolume > volumeMA.values ? "up" : "down";

    // Divergence detection
    if (priceDirection === "up" && volumeDirection === "down") return "weak-uptrend";
    if (priceDirection === "down" && volumeDirection === "down") return "weak-downtrend";
    if (priceDirection === "up" && volumeDirection === "up") return "strong-uptrend";
    if (priceDirection === "down" && volumeDirection === "up") return "strong-downtrend";

    return "neutral";
  }

  static calculateVolatility(data, period = 14) {
    if (data.length < period) period = data.length;
    let sum = 0;
    for (let i = 1; i < period; i++) {
      sum += (data[i].high - data[i].low) / data[i - 1].close;
    }
    return (sum / (period - 1)) * data[data.length - 1].close;
  }
}
