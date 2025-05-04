const Trader = require("./trader");
const fixNum = (n) => +n.toFixed(2);

class AdvanceTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.position = null;
    this.decisions = ["HOLD"];
    this.rsi = [];
    this.patterns = [];
    this.range = (150 * this.interval) / 60 / 24; // 150 used by "detectTrendlines" function
  }

  async run() {
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = this.testMode ? this.position : (await this.ex.getOrders(this.pair))[0];
    const currentPrice = await this.ex.currentPrices(this.pair); // { tradePrice, askPrice, bidPrice }
    const ohlc = await this.ex.pricesData(this.pair, this.interval, this.range); // Returns max 720 item (720 * 5 / 60 / 24 = 2.5 days)

    const decision = this.analyzeMarket(ohlc);
    // if (decision !== "HOLD") this.decisions.push(decision);
    // if (this.decisions.length > 1) this.decisions.shift();

    const testLog = this.testMode ? "TEST:" : "";
    const positionLog = position ? "YES" : "NO";

    // this.decisions.every((d) => d === "BUY")
    // this.decisions.every((d) => d === "SELL")
    if (decision == "BUY") {
      this.dispatch("LOG", `${testLog} [+] Breakout detected - Position: ${positionLog}.`);
      if (!position) {
        await this.buy(balance, currentPrice.askPrice);
        this.dispatch("LOG", `${testLog} Placed BUY at: ${currentPrice.askPrice}`);
      }
      //
    } else if (decision === "SELL") {
      this.dispatch("LOG", `${testLog} [-] Breakdown detected - Position: ${positionLog}.`);
      if (position) {
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        this.dispatch("LOG", `${testLog} Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }
    } else {
      this.dispatch("LOG", `${testLog} [=] No trade signal. decision: ${decision}`);
    }
  }

  // ===== breakout breakdown based Strategy
  analyzeMarket(data) {
    const closes = data.slice(-20).map((d) => d.close);
    this.rsi.push(TechnicalAnalysis.calculateRSI(closes, this.rsiPeriod).value);
    if (this.rsi.length < 2) this.rsi.push(this.rsi[0]);
    if (this.rsi.length > 2) this.rsi.shift();

    this.patterns.push(TechnicalAnalysis.detectCandlestickPattern(data));
    if (this.patterns.length < 2) this.patterns.push(this.patterns[0]);
    if (this.patterns.length > 2) this.patterns.shift();

    const last = data.at(-1);
    const prev = data.at(-2);
    const [prevRSI, lastRSI] = this.rsi;
    const [prevPattern, lastPattern] = this.patterns;

    // Calculate market volatility (ATR-like measure)

    const volatility = TechnicalAnalysis.calculateVolatility(data, this.interval);
    const isHighVolatility = volatility > last.close * 0.015;

    const { support, resistance } = TechnicalAnalysis.findSupportResistance(data, this.interval);
    const { trend, crossover } = TechnicalAnalysis.detectTrend(data.slice(-30));
    const closeRegression = TechnicalAnalysis.linearRegression(data.slice(-15).map((it) => it.close));
    const trendlines = TechnicalAnalysis.detectTrendlines(data.slice(-150));

    const validResistance = TechnicalAnalysis.isTrendlineValid(trendlines.resistances.map((it) => it.price));
    const validSupport = TechnicalAnalysis.isTrendlineValid(trendlines.supports.map((it) => it.price));

    const period = 6;
    const volumeDivergence = TechnicalAnalysis.detectVolumeDivergence(data.slice(-8));
    const volumeRising = TechnicalAnalysis.analyzeVolume(data.slice(-period));
    const avgVolume = data.slice(-period).reduce((sum, d) => sum + d.volume, 0) / period;

    // Breakout confirmation conditions (refined for simple S/R method)
    const resistanceBreakoutConfirmed =
      last.close > resistance * 1.001 && // Slightly above resistance
      last.close > last.open && // Bullish candle
      last.volume > avgVolume; // Volume confirmation

    const supportBreakdownConfirmed =
      last.close < support * 0.999 && // Slightly below support
      last.close < last.open && // Bearish candle
      last.volume > avgVolume; // Volume confirmation

    // Trendline breakout conditions with confirmation
    const resistanceTrendlineBreakout =
      validResistance &&
      last.close > Math.max(...trendlines.resistances.map((t) => t.price)) &&
      last.close > last.open &&
      last.volume > avgVolume;

    const supportTrendlineBreakdown =
      validSupport &&
      last.close < Math.min(...trendlines.supports.map((t) => t.price)) &&
      last.close < last.open &&
      last.volume > avgVolume;

    // Calculate scores with volatility adjustment
    const baseScore = isHighVolatility ? 5 : 4; // Require higher confidence in volatile markets
    const score = { breakout: 0, breakdown: 0 };

    /*======= Breakout logic =======*/
    if (resistanceBreakoutConfirmed) score.breakout += 2;
    if (resistanceTrendlineBreakout) score.breakout += 1.5;

    if (lastRSI > 52 && lastRSI - prevRSI > 2) score.breakout += 1;
    // if (lastRSI > 55 && lastRSI - prevRSI > 5) score.breakout += 1;

    if (last.close >= support * 0.99) {
      if (volumeDivergence === "strong-uptrend") score.breakout += 1;
      else if (volumeDivergence === "weak-uptrend") score.breakout += 0.5;
    }

    const risingScr = volumeRising == "strong-rise" ? 1 : volumeRising == "moderate-rise" ? 0.5 : 0;
    if (trend === "strong-up") score.breakout += risingScr + 1;
    else if (trend === "moderate-up") score.breakout += risingScr + 0.5;
    else score.breakout += risingScr; // Moderate volume changes

    if (closeRegression.slope > 0) {
      if (closeRegression.strength === "strong") {
        score.breakout += 1.5;
        score.breakdown -= 1.5;
      }
      if (closeRegression.strength === "moderate") {
        score.breakout += 1;
        score.breakdown -= 1;
      }
      if (closeRegression.strength === "week") {
        score.breakout += 0.5;
        score.breakdown -= 0.5;
      }
    }

    if (lastPattern.pattern === "bullish-engulfing") {
      const nearSupport = last.close >= support && last.close <= support * 1.01;
      score.breakout += nearSupport ? 2 : 1;
    }
    if (lastPattern.pattern === "hammer") {
      // Hammer pattern at support is strong indication of reversal
      score.breakout += last.close > last.open && prev.low < support * 1.01 ? 2 : 1;
    }
    if (lastPattern.pattern === "morning-star") {
      // The pattern must form after a pullback to support and show a reversal
      score.breakout += prev.close < support * 1.01 && last.close > support ? 3 : 1;
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
      ].includes(lastPattern.pattern)
    ) {
      if (last.close > support && last.low >= support * 0.995 && last.close > last.open) {
        score.breakout += 2;
      } else {
        score.breakout += 1;
      }
    }

    /*======= Breakdown logic =======*/
    if (supportBreakdownConfirmed) score.breakdown += 2.5;
    if (supportTrendlineBreakdown) score.breakdown += 1.5;

    if (lastRSI < 48 && prevRSI - lastRSI > 2) score.breakdown += 1;
    // if (lastRSI < 45 && prevRSI - lastRSI > 5) score.breakdown += 1;

    if (!(last.close > resistance * 1.01)) {
      if (volumeDivergence === "strong-downtrend") score.breakdown += 1;
      else if (volumeDivergence === "weak-downtrend") score.breakdown += 0.5;
    }

    const fallingScr = volumeRising == "strong-fall" ? 1 : volumeRising == "moderate-fall" ? 0.5 : 0;
    if (trend === "strong-down") score.breakdown += fallingScr + 1;
    else if (trend === "moderate-down") score.breakdown += fallingScr + 0.5;
    else score.breakdown += fallingScr; // Moderate volume changes

    if (closeRegression.slope < 0) {
      if (closeRegression.strength === "strong") {
        score.breakdown += 1.5;
        score.breakout -= 1.5;
      }
      if (closeRegression.strength === "moderate") {
        score.breakdown += 1;
        score.breakout -= 1;
      }
      if (closeRegression.strength === "week") {
        score.breakdown += 0.5;
        score.breakout -= 0.5;
      }
    }

    if (lastPattern.pattern === "evening-star") score.breakdown += last.close < resistance ? 2 : 1;
    if (["dark-cloud-cover", "bearish-engulfing"].includes(lastPattern.pattern)) {
      const nearResistance = last.close <= resistance && last.close >= resistance * 0.995;
      score.breakdown += nearResistance ? 2 : 1;
    }
    if (lastPattern.pattern === "shooting-star") {
      score.breakdown += last.close < last.open && last.high >= resistance * 0.99 ? 2 : 1;
    }
    // Bearish patterns
    if (
      ["gravestone-doji", "hanging-man", "bearish-harami", "three-black-crows", "three-inside-down"].includes(
        lastPattern.pattern
      )
    ) {
      if (last.close < resistance && last.high < resistance * 1.001 && last.close < last.open) {
        score.breakdown += 2;
      } else {
        score.breakdown += 1;
      }
    }

    if (score.breakout >= baseScore && score.breakdown >= baseScore) {
      if (score.breakout === score.breakdown && closeRegression.strength === "strong") {
        if (closeRegression.slope > 0) score.breakdown -= 1;
        if (closeRegression.slope < 0) score.breakout -= 1;
      }
      if (score.breakout > score.breakdown) score.breakdown -= 1;
      if (score.breakdown > score.breakout) {
        score.breakdown -= 1;
        // if (last.close > (resistance ?? 0) * 1.01) score.breakdown = 1.3; // 1.3 to know it's overridden
        // else score.breakdown -= 1;
      }
    }

    // Final decision with dynamic threshold and confirmation
    const decision = score.breakout >= baseScore ? "BUY" : score.breakdown >= baseScore ? "SELL" : "HOLD";

    // === Debug Logs ===
    this.dispatch("LOG", `\n=== Decision Debug based on scoring system ===`);
    this.dispatch("LOG", `Last Close: ${fixNum(last.close)}`);
    this.dispatch(
      "LOG",
      `Volume (Prev): ${fixNum(prev.volume)} (Last): ${fixNum(last.volume)} (Avg): ${fixNum(avgVolume)}`
    );
    this.dispatch("LOG", `RSI (Prev): ${prevRSI} (Last): ${lastRSI}`);
    this.dispatch("LOG", `Pattern: ${lastPattern.pattern} - reliability: ${lastPattern.reliability}`);
    this.dispatch("LOG", `Trend: ${trend} - crossover: ${crossover}`);
    this.dispatch("LOG", `Slope Trend: ${closeRegression.slope} - ${closeRegression.strength}`);
    this.dispatch("LOG", `Volume Divergence: ${volumeDivergence} - ${volumeRising}`);
    this.dispatch("LOG", `Support: ${support} Resistance: ${resistance}`);
    this.dispatch("LOG", `Valid Support Line: ${validSupport}`);
    this.dispatch("LOG", `Valid Resistance Line: ${validResistance}`);
    this.dispatch("LOG", `Resistance Breakout Confirmed: ${resistanceBreakoutConfirmed}`);
    this.dispatch("LOG", `Support Breakdown Confirmed: ${supportBreakdownConfirmed}`);
    this.dispatch("LOG", `Resistance Trendline Breakout: ${resistanceTrendlineBreakout}`);
    this.dispatch("LOG", `Support Trendline Breakdown: ${supportTrendlineBreakdown}`);
    this.dispatch(
      "LOG",
      `Score Base: ${baseScore} (breakout): ${score.breakout} (breakdown): ${score.breakdown}`
    );
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
    if (!data || data.length < 2) return { trend: "none", slope: 0, intercept: 0, r2: 0 };
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
      trend: slope > 0 ? "uptrend" : slope < 0 ? "downtrend" : "sideways",
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

  static calculateVolatility(data, period = 14, interval) {
    const lookBack = { 5: 24, 15: 16, 30: 12, 60: 8 };
    data = data.slice(-(lookBack[interval] || 24));
    if (data.length < period) period = data.length;
    let sum = 0;

    for (let i = 1; i < period; i++) {
      sum += (data[i].high - data[i].low) / data[i - 1].close;
    }
    return (sum / (period - 1)) * data[data.length - 1].close;
  }

  static findSupportResistance(data, interval) {
    if (!data || data.length < 20) return { support: null, resistance: null };
    data = data.slice(-(interval >= 15 ? 20 : 30));

    const highs = data.map((d) => d.high);
    const lows = data.map((d) => d.low);
    return {
      support: Math.min(...lows),
      resistance: Math.max(...highs),
    };
  }
}

/*
Suggested data length for each method Table
Method	            5m      15m	  30m	    60m
RSI (14)            15–20	  15–20	15–20	  15–20
Candlestick Pattern	3–5	    3–5	  3–5	    3–5
Volatility	        24	    16	  12	    8
Support/Resistance	20–30	  20	  20	    20
Trend Detection	    30–50	  30	  25	    25
Trendline Detection	100–200	120	  100–150	100
Volume Divergence	  6–10	  6–10	6–10	  6–10
Volume Rising	      5–6	    5–6	  5–6	    5–6
*/
