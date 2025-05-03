const Trader = require("./trader.js");

const services = require("../trend-analysis.js");
const { calculateRSI } = require("../indicators.js");
const { normalizePrices, calcPercentageDifference } = require("../services.js");
const calcPercentage = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = (12 * 60) / this.interval;

    this.position = null;
    this.decisions = ["HOLD"];
    this.rsi = [];
    this.roc = [];
  }

  async run() {
    // Get data from Kraken
    const prices = await this.ex.prices(this.pair, this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = this.testMode ? this.position : (await this.ex.getOrders(this.pair))[0];
    // const currentPrice = await this.ex.currentPrices(this.pair); // { tradePrice, askPrice, bidPrice }
    // const { trades } = await this.ex.state.getBot(this.pair);
    const currentPrice = prices.at(-1);
    if (prices.length < this.range) return;

    const normalizedPrices = normalizePrices(prices);

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    this.rsi.push(calculateRSI(normalizedPrices, this.rsiPeriod));
    if (this.rsi.length < 2) this.rsi.push(this.rsi[0]);
    if (this.rsi.length > 2) this.rsi.shift();

    const result = this.analyzeMarket(normalizedPrices);
    this.decisions.push(result.decision);
    if (this.decisions.length > 2) this.decisions.shift();

    console.log(this.rsi, this.decisions.join("-"), result);

    const testLog = this.testMode ? "TEST:" : "";
    const positionLog = position ? "YES" : "NO";

    if (this.decisions.every((d) => d === "BUY")) {
      this.dispatch("LOG", `${testLog} [+] Breakout detected - Position: ${positionLog}.`);
      if (!position) {
        await this.buy(balance, currentPrice.askPrice);
        this.dispatch("LOG", `${testLog} Placed BUY at: ${currentPrice.askPrice}`);
      }
      //
    } else if (this.decisions.every((d) => d === "SELL")) {
      this.dispatch("LOG", `${testLog} [-] Breakdown detected - Position: ${positionLog}.`);
      if (position) {
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        this.dispatch("LOG", `${testLog} Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }
    } else {
      this.dispatch("LOG", `${testLog} [=] No trade signal. decision: ${this.decisions.join("-")}`);
    }

    this.dispatch("LOG", "");
  }

  analyzeMarket(prices) {
    const lastClose = prices.at(-1);
    const prevClose = prices.at(-2);
    const currentRSI = this.rsi.at(-1);
    const prevRSI = this.rsi.at(-2);

    // Check volatility
    const volatility = Analyzer.historicalVolatility(prices, 20, 5); // 20-period = 100min
    const isHighVolatility = volatility > 0.005; // 0.5% threshold for 5m crypto
    const baseScore = isHighVolatility ? 5 : 4; // Require higher confidence in volatile markets
    const score = { breakout: 0, breakdown: 0 };

    //  Support and Resistance Proximity
    const { support, resistance } = Analyzer.findSupportResistance(prices);
    const supportProximity = Math.abs((lastClose - support) / support);
    const resistanceProximity = Math.abs((resistance - lastClose) / resistance);
    const proximityThreshold = 0.01; // 1%
    if (supportProximity <= proximityThreshold) score.breakout += 0.5;
    if (resistanceProximity <= proximityThreshold) score.breakdown += 0.5;

    if (currentRSI > 52 && currentRSI - prevRSI > 2) score.breakout += 1;
    if (currentRSI > 55 && currentRSI - prevRSI > 5) score.breakout += 1;

    if (currentRSI < 48 && prevRSI - currentRSI > 2) score.breakdown += 1;
    if (currentRSI < 45 && prevRSI - currentRSI > 5) score.breakdown += 1;

    // Trend detection
    const trend = Analyzer.detectTrend(prices);
    if (trend === "bullish") score.breakout += 1.5;
    else if (trend === "bearish") score.breakdown += 1.5;

    //  Linear Regression (last 100 periods)
    const lr = Analyzer.linearRegression(prices.slice(-100));
    if (lr.strength === "strong") {
      if (lr.slope > 0) score.breakout += 1;
      else if (lr.slope < 0) score.breakdown += 1;
    } else if (lr.strength === "moderate") {
      if (lr.slope > 0) score.breakout += 0.5;
      else if (lr.slope < 0) score.breakdown += 0.5;
    }

    //  Breakout/Breakdown Detection
    const breakoutDownDetection = Analyzer.detectBreakoutOrBreakdown(prices);
    if (breakoutDownDetection.includes("Likely breakout")) score.breakout += 2;
    else if (breakoutDownDetection.includes("Potential breakout")) score.breakout += 1;
    else if (breakoutDownDetection.includes("Likely breakdown")) score.breakdown += 2;
    else if (breakoutDownDetection.includes("Potential breakdown")) score.breakdown += 1;

    //  Rate of Change (ROC)
    const dynamicRocPeriod = volatility > lastClose * 0.02 ? 100 : 50; // Shorter period in high volatility
    const rocPrices = prices.slice(-dynamicRocPeriod);
    const roc = Analyzer.calculateROC(rocPrices);

    if (roc > 0.5) score.breakout += 0.5;
    else if (roc < -0.5) score.breakdown += 0.5;

    // Divergence Detection
    const rocValues = [];
    for (let i = 1; i < rocPrices.length; i++) {
      rocValues.push(((rocPrices[i] - rocPrices[i - 1]) / rocPrices[i - 1]) * 100);
    }
    const divergence = Analyzer.detectDivergence(rocPrices, rocValues);
    if (divergence === "bullish-divergence") score.breakout += 1;
    else if (divergence === "bearish-divergence") score.breakdown += 1;

    //  MACD Analysis
    const macd = Analyzer.calculateMACD(prices);
    if (macd) {
      const macdLine = macd.macdLine.at(-1);
      const signalLine = macd.signalLine.at(-1);
      const histogram = macd.histogram.at(-1);
      if (macdLine > signalLine && histogram > 0) score.breakout += 1;
      else if (macdLine < signalLine && histogram < 0) score.breakdown += 1;
    }

    //  Bollinger Bands Analysis
    const bb = Analyzer.bollingerBands(prices);
    if (bb) {
      const upper = bb.upper.at(-1);
      const lower = bb.lower.at(-1);
      const percentB = (lastClose - lower) / (upper - lower);
      if (percentB > 0.8) score.breakout += 0.5; // Overbought
      else if (percentB < 0.2) score.breakdown += 0.5; // Oversold
    }

    // 9. Fractal Efficiency
    const fractalEff = Analyzer.fractalEfficiency(prices);
    if (fractalEff > 0.6) score.breakout += 0.5;
    else if (fractalEff < 0.4) score.breakdown += 0.5;

    // 10. Chande Momentum Oscillator
    const cm = Analyzer.chandeMomentum(prices);
    if (cm.length > 0) {
      const cmLatest = cm.at(-1);
      if (cmLatest > 0) score.breakout += 0.5;
      else if (cmLatest < 0) score.breakdown += 0.5;
    }

    // 11. Klinger Oscillator
    const ko = Analyzer.klingerOscillator(prices);
    if (ko) {
      const kvo = ko.kvo.at(-1);
      const signal = ko.signal.at(-1);
      if (kvo > signal) score.breakout += 0.5;
      else if (kvo < signal) score.breakdown += 0.5;
    }

    // 12. Adaptive Price Zone
    const apz = Analyzer.adaptivePriceZone(prices);
    if (lastClose > apz.upper) score.breakout += 0.5;
    else if (lastClose < apz.lower) score.breakdown += 0.5;

    // 13. Price Tendency
    const tendency = Analyzer.priceTendency(prices);
    if (tendency > 0.7) score.breakout += 0.5;
    else if (tendency < 0.3) score.breakdown += 0.5;

    return {
      score,
      decision: score.breakout >= baseScore ? "BUY" : score.breakdown >= baseScore ? "SELL" : "HOLD",
      baseScore,
      support,
      resistance,
      trend,
      roc,
      linearRegression: lr,
      breakoutDownDetection,
      divergence,
      macd: !macd
        ? null
        : {
            macdLine: macd.macdLine.at(-1),
            signalLine: macd.signalLine.at(-1),
            histogram: macd.histogram.at(-1),
          },
      bollingerBands: !bb
        ? null
        : {
            upper: bb.upper.at(-1),
            lower: bb.lower.at(-1),
          },

      fractalEfficiency: fractalEff,
      chandeMomentum: cm?.at(-1) || null,
      klingerOscillator: !ko
        ? null
        : {
            kvo: ko.kvo.at(-1),
            signal: ko.signal.at(-1),
          },
      adaptivePriceZone: apz,
      priceTendency: tendency,
    };
  }
}

module.exports = BasicTrader;

// Technical Analysis Functions
class Analyzer {
  static detectTrend(prices, period = 30) {
    if (!Array.isArray(prices) || prices.length < period) return "insufficient-data";
    const sma = Analyzer.simpleMovingAverage(prices, period);
    if (sma.slope > 0.05) return "bullish";
    if (sma.slope < -0.05) return "bearish";
    return "sideways";
  }

  static calculateROC(prices) {
    if (prices.length < 2) return null;
    const current = prices.at(-1); // Last element
    const past = prices.at(-2); // Second-to-last
    if (past === 0) return 0; // Prevent division by zero
    return ((current - past) / past) * 100;
  }

  // Simple Moving Average (SMA) method is used to calculate the average of past prices. adjust the period to any desired period that better match your analysis needs, for example:
  // 1. Day Traders: Might use shorter periods like 5 or 10 to capture quick market movements.
  // 2. Swing Traders: Might prefer periods like 20 or 50 to identify intermediate trends.
  // 3. Long-Term Investors: Might use periods like 100 or 200 to focus on long-term trends.
  static simpleMovingAverage(data, period) {
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
    // Trend Indicator:
    // 1. When sma Above Last Price or the sma is higher than the current price, means that the price is trending downwards signaling a potential buying opportunity if the trend is expected to reverse.
    // 2. When sma Below Last Price, means an upward trend, signaling a potential selling opportunity if the trend is expected to reverse.
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

  static detectBreakoutOrBreakdown(prices, sensitivity = 0.5) {
    /* Suggested minimums:
  Interval	| Recommended History
  5m        | Last 2–3 hours (24–36 candles)
  15m       | Last 6–8 hours (24–32 candles)
  1h        | Last 2–4 days (48–96 candles)
  1d        | Last 2–4 weeks (15–30 candles)
  */

    if (prices.length < 20) throw new Error("detectBreakoutOrBreakdown: Not enough data");

    const window = 5; // number of candles to confirm swing highs/lows
    const highs = [];
    const lows = [];

    for (let i = window; i < prices.length - window; i++) {
      const slice = prices.slice(i - window, i + window + 1);
      const mid = prices[i];

      const isHigh = slice.every((p) => mid >= p);
      const isLow = slice.every((p) => mid <= p);

      if (isHigh) highs.push({ i, price: mid });
      if (isLow) lows.push({ i, price: mid });
    }

    // Early exit if not enough swings
    if (highs.length < 2 && lows.length < 2) return "No strong pattern detected";

    // Check rising lows
    let risingLows = 0;
    for (let i = 1; i < lows.length; i++) {
      if (lows[i].price > lows[i - 1].price) risingLows++;
    }

    // Check falling highs
    let fallingHighs = 0;
    for (let i = 1; i < highs.length; i++) {
      if (highs[i].price < highs[i - 1].price) fallingHighs++;
    }

    const recentHigh = highs[highs.length - 1]?.price || 0;
    const recentLow = lows[lows.length - 1]?.price || Infinity;
    const latestPrice = prices[prices.length - 1];

    const breakout = ((latestPrice - recentHigh) / recentHigh) * 100 >= sensitivity;
    const breakdown = ((recentLow - latestPrice) / recentLow) * 100 >= sensitivity;

    if (risingLows >= 2 && breakout) {
      return "Likely breakout (rise)";
    } else if (fallingHighs >= 2 && breakdown) {
      return "Likely breakdown (drop)";
    } else if (risingLows >= 2) {
      return "Potential breakout forming";
    } else if (fallingHighs >= 2) {
      return "Potential breakdown forming";
    } else {
      return "No strong pattern detected";
    }
  }

  static detectDivergence(prices, rocValues) {
    if (prices.length < 2 || rocValues.length < 2) return null;

    const priceSlice = prices;
    const rocSlice = rocValues;

    // Find peaks/troughs for price and ROC
    const pricePeaks = [];
    const priceTroughs = [];
    const rocPeaks = [];
    const rocTroughs = [];

    for (let i = 1; i < priceSlice.length - 1; i++) {
      // Price extremes
      if (priceSlice[i] > priceSlice[i - 1] && priceSlice[i] > priceSlice[i + 1]) {
        pricePeaks.push({ value: priceSlice[i], index: i });
      }
      if (priceSlice[i] < priceSlice[i - 1] && priceSlice[i] < priceSlice[i + 1]) {
        priceTroughs.push({ value: priceSlice[i], index: i });
      }

      // ROC extremes
      if (rocSlice[i] > rocSlice[i - 1] && rocSlice[i] > rocSlice[i + 1]) {
        rocPeaks.push({ value: rocSlice[i], index: i });
      }
      if (rocSlice[i] < rocSlice[i - 1] && rocSlice[i] < rocSlice[i + 1]) {
        rocTroughs.push({ value: rocSlice[i], index: i });
      }
    }

    // Analyze last 2 peaks/troughs
    const recentPricePeaks = pricePeaks.slice(-2);
    const recentRocPeaks = rocPeaks.slice(-2);
    const recentPriceTroughs = priceTroughs.slice(-2);
    const recentRocTroughs = rocTroughs.slice(-2);

    if (recentRocPeaks.length < 2 || recentPricePeaks.length < 2) return null;

    // In detectDivergence()
    const minROCChange = 5; // 5% minimum change
    if (Math.abs(recentRocPeaks[1].value - recentRocPeaks[0].value) < minROCChange) return;
    const maxIndexDiff = 5;
    if (Math.abs(recentPricePeaks[1].index - recentRocPeaks[1].index) > maxIndexDiff) return;

    // Bearish divergence (price ↗ ROC ↘)
    if (recentPricePeaks.length >= 2 && recentRocPeaks.length >= 2) {
      const priceHigher = recentPricePeaks[1].value > recentPricePeaks[0].value;
      const rocLower = recentRocPeaks[1].value < recentRocPeaks[0].value;
      if (priceHigher && rocLower) return "bearish-divergence";
    }

    // Bullish divergence (price ↘ ROC ↗)
    if (recentPriceTroughs.length >= 2 && recentRocTroughs.length >= 2) {
      const priceLower = recentPriceTroughs[1].value < recentPriceTroughs[0].value;
      const rocHigher = recentRocTroughs[1].value > recentRocTroughs[0].value;
      if (priceLower && rocHigher) return "bullish-divergence";
    }

    return "no-divergence";
  }

  // MACD (Moving Average Convergence Divergence) is a Trend-following momentum indicator
  static calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (prices.length < slowPeriod) return null; // Add validation
    const fastEMA = this.exponentialMovingAverage(prices, fastPeriod);
    const slowEMA = this.exponentialMovingAverage(prices, slowPeriod);
    const macdLine = fastEMA.map((v, i) => v - slowEMA[i]);
    const signalLine = this.exponentialMovingAverage(macdLine, signalPeriod);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);

    return { macdLine, signalLine, histogram };

    // const { macdLine, signalLine, histogram } = Analyzer.calculateMACD(prices);
    // if (macdLine.at(-1) > signalLine.at(-1)) score.breakout += 1.5;
  }
  static exponentialMovingAverage(data, period) {
    const k = 2 / (period + 1);
    const ema = [data[0]];
    for (let i = 1; i < data.length; i++) {
      ema.push(data[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }

  /**
   bollingerBands is Volatility and overbought/oversold levels indicator
   * Calculates Bollinger Bands
   * @param {number[]} prices - Array of closing prices
   * @param {number} period - Lookback period (default: 20)
   * @param {number} deviations - Standard deviations (default: 2)
   * @returns {Object} { upper: number[], middle: number[], lower: number[] }
   */
  static bollingerBands(prices, period = 20, deviations = 2) {
    const sma = this.simpleMovingAverage(prices, period).values;
    const stdDev = [];

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = sma[i - period + 1];
      const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
      stdDev.push(Math.sqrt(variance));
    }

    return {
      upper: sma.map((v, i) => v + stdDev[i] * deviations),
      middle: sma,
      lower: sma.map((v, i) => v - stdDev[i] * deviations),
    };

    // const bands = Analyzer.bollingerBands(prices);
    // const lastClose = prices.at(-1);
    // if (lastClose > bands.upper.at(-1)) score.breakdown += 1.2;
    // if (lastClose < bands.lower.at(-1)) score.breakout += 1.2;
  }

  // priceChannel is Dynamic support/resistance levels indicator
  static findSupportResistance(prices) {
    return {
      support: Math.min(...prices), // upper
      resistance: Math.max(...prices), // lower
    };
  }
  // const channel = Analyzer.findSupportResistance(prices);
  // if (lastClose > channel.upper) score.breakout += 2;

  // historicalVolatility is Measure price fluctuation intensity indicator
  static historicalVolatility(prices, period = 20, intervalMinutes = 5) {
    if (prices.length < period + 1) return null;

    const logReturns = [];
    for (let i = 1; i < prices.length; i++) {
      logReturns.push(Math.log(prices[i] / prices[i - 1]));
    }

    const returnsSlice = logReturns.slice(-period);
    const mean = returnsSlice.reduce((a, b) => a + b, 0) / period;
    const variance = returnsSlice.reduce((a, r) => a + Math.pow(r - mean, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const intervalsPerYear = (365 * 24 * 60) / intervalMinutes; // 105,120 for 5m
    return stdDev * Math.sqrt(intervalsPerYear);

    // const volatility = Analyzer.historicalVolatility(prices, 20, 5); // 20-period = 100min
    // const isHighVolatility = volatility > 0.005; // 0.5% threshold for 5m crypto
    // const baseScore = isHighVolatility ? 5 : 4;

    // const vol = Analyzer.historicalVolatility(prices);
    // if (vol > 0.4) score.breakout -= 1; // Reduce positions in high volatility

    /* Threshold Adjustment for 5m Data. Typical 5-Minute Volatility Ranges:
        Market        | Low Volatility  | High Volatility
        Crypto (BTC)  | < 0.3%          | > 0.7%
        Stocks (SPY)  | < 0.1%          | > 0.3%
        Forex (EURUSD)| < 0.05%         | > 0.15%

      time:
        Scalping: 12-36 periods (1-3 hours)
        Swing: 72-288 periods (6h-24h)
    */
  }

  // Measure trend strength
  static fractalEfficiency(prices, period = 10) {
    const netChange = Math.abs(prices.at(-1) - prices.at(-period));
    const totalMovement = prices
      .slice(-period)
      .reduce((sum, v, i, arr) => sum + (i > 0 ? Math.abs(v - arr[i - 1]) : 0), 0);
    return totalMovement !== 0 ? netChange / totalMovement : 0;

    // const efficiency = Analyzer.fractalEfficiency(prices);
    // if (efficiency > 0.7) score.breakout += 1.5; // Strong trend
  }

  // chandeMomentum is Momentum detection indicator

  static chandeMomentum(prices, period = 14) {
    const momentum = [];

    for (let i = period; i < prices.length; i++) {
      // Get period+1 prices to calculate period price changes
      const slice = prices.slice(i - period, i + 1);
      let sumGains = 0;
      let sumLosses = 0;

      // Calculate changes between consecutive prices
      for (let j = 1; j < slice.length; j++) {
        const change = slice[j] - slice[j - 1];
        if (change > 0) {
          sumGains += change;
        } else {
          sumLosses += Math.abs(change);
        }
      }

      // Avoid division by zero
      const total = sumGains + sumLosses;
      const cmoValue = total !== 0 ? ((sumGains - sumLosses) / total) * 100 : 0;

      momentum.push(Number(cmoValue.toFixed(2)));
    }

    return momentum;

    // const cmo = Analyzer.chandeMomentum(prices);
    // if (cmo.at(-1) > 50) score.breakout += 1;
  }

  // klingerOscillator is Detect money flow trends indicator
  static klingerOscillator(prices, period = 34, signalPeriod = 13) {
    const vf = [0]; // Volume Force (approximated)
    for (let i = 1; i < prices.length; i++) {
      const trend = prices[i] > prices[i - 1] ? 1 : -1;
      vf.push(trend * Math.abs(prices[i] - prices[i - 1]));
    }

    const kvo = this.exponentialMovingAverage(vf, period);
    const signal = this.exponentialMovingAverage(kvo, signalPeriod);
    return { kvo, signal };

    //   const { kvo, signal } = Analyzer.klingerOscillator(prices);
    // if (kvo.at(-1) > signal.at(-1)) score.breakout += 1;
  }

  // elderThermometer is Measure price risk/volatility indicator
  static elderThermometer(prices, period = 22) {
    const trueRanges = [];
    for (let i = 1; i < prices.length; i++) {
      trueRanges.push(Math.abs(prices[i] - prices[i - 1]));
    }
    return Math.max(...trueRanges.slice(-period));

    // const risk = Analyzer.elderThermometer(prices);
    // if (risk > lastClose * 0.03) score.breakout -= 0.5; // Avoid volatile entries
  }

  // adaptivePriceZone is Dynamic trend following indicator
  static adaptivePriceZone(prices, period = 20) {
    const sma = this.simpleMovingAverage(prices, period).values;
    const dev = prices.slice(-period).map((c, i) => Math.abs(c - sma[i]));
    const avgDev = dev.reduce((a, b) => a + b, 0) / period;
    return {
      upper: sma.at(-1) + avgDev * 2,
      lower: sma.at(-1) - avgDev * 2,
    };

    // const zone = Analyzer.adaptivePriceZone(prices);
    // if (lastClose > zone.upper) score.breakout += 1.8;
  }

  // priceTendency Identify emerging trends indicator
  static priceTendency(prices) {
    const highs = Math.max(...prices);
    const lows = Math.min(...prices);
    if (highs === lows) return 0.5; // Neutral value
    return (prices.at(-1) - lows) / (highs - lows); // Normalized position

    // const tendency = Analyzer.priceTendency(prices);
    // if (tendency > 0.8) score.breakout += 1.2;
  }
}
