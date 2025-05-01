const Trader = require("./trader.js");

const services = require("../trend-analysis.js");
const { calculateRSI } = require("../indicators.js");
const { normalizePrices, calcPercentageDifference } = require("../services.js");
const calcPercentage = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = (6 * 60) / this.interval;

    this.position = null;
    this.decisions = ["HOLD"];
    this.rsi = [];
    this.roc = [];
    // this.rocHistory = [];
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

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    this.rsi.push(calculateRSI(prices, this.rsiPeriod));
    if (this.rsi.length < 2) this.rsi.push(this.rsi[0]);
    if (this.rsi.length > 2) this.rsi.shift();

    const decision = this.analyzeMarket(normalizedPrices);
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
    this.dispatch("LOG", "");
  }

  analyzeMarket(prices) {
    // Now takes prices array instead of OHLC data
    const lastClose = prices.at(-1);
    const prevClose = prices.at(-2);

    // Simplified Support/Resistance
    const { support, resistance } = Analyzer.findSupportResistance(prices);
    const result = Analyzer.detectBreakoutOrBreakdown(prices.slice(-36));

    // Trend detection
    const trend = Analyzer.detectTrend(prices);

    // Simplified volatility
    const volatility = Analyzer.calculateVolatility(prices);
    const isHighVolatility = volatility > lastClose * 0.01;
    const baseScore = isHighVolatility ? 5 : 4; // Require higher confidence in volatile markets
    const score = { breakout: 0, breakdown: 0 };

    // Linear regression remains unchanged
    const closeRegression = Analyzer.linearRegression(prices.slice(-15));

    // Calculate ROC
    const dynamicRocPeriod = volatility > lastClose * 0.02 ? 25 : 14; // Shorter period in high volatility
    const rocPrices = prices.slice(-dynamicRocPeriod);
    const roc = Analyzer.calculateROC(rocPrices);

    this.roc.push(roc);
    if (this.rocHistory.length > 50) this.rocHistory.shift(); // Keep 50 periods
    // this.roc.push(roc);
    // if (this.roc.length < 2) this.roc.push(this.roc[0]);
    // if (this.roc.length > 2) this.roc.shift();

    // Calculate ROC's SMA for smoother signal
    const rocSMA = Analyzer.simpleMovingAverage(
      prices
        .map(
          (_, i, arr) =>
            Analyzer.calculateROC(arr.slice(0, i + 1), rocPrices.length).filter((v) => v !== null),
          5
        )
        .values.at(-1)
    );

    // Add ROC-based scoring conditions
    if (roc > 5) {
      // Bullish threshold
      score.breakout += 1.5;
      if (rocSMA > roc) score.breakout += 0.5; // Confirming trend
    }

    if (roc < -5) {
      // Bearish threshold
      score.breakdown += 1.5;
      if (rocSMA < roc) score.breakdown += 0.5;
    }

    const divergence = TechnicalAnalysis.detectDivergence(prices, this.roc);
    // Add to scoring logic
    if (divergence === "bearish-divergence") {
      score.breakdown += 3; // Strong bearish signal
      if (lastClose > resistance) score.breakdown += 1; // Extra weight at key levels
    }

    if (divergence === "bullish-divergence") {
      score.breakout += 3; // Strong bullish signal
      if (lastClose < support) score.breakout += 1;
    }

    // const resistanceBreakoutConfirmed = lastClose > resistance * 1.005 && lastClose > prices.at(-3); // Confirm upward momentum
    // const supportBreakdownConfirmed = lastClose < support * 0.995 && lastClose < prices.at(-3); // Confirm downward momentum

    // const resistanceBreakoutConfirmed =
    //   lastClose > resistance * 1.005 &&
    //   roc > 3 && // Require positive momentum
    //   rocSMA > 0;
    // const supportBreakdownConfirmed =
    //   lastClose < support * 0.995 &&
    //   roc < -3 && // Require negative momentum
    //   rocSMA < 0;

    const resistanceBreakoutConfirmed =
      lastClose > resistance * 1.005 &&
      divergence !== "bearish-divergence" && // Block entry if divergence present
      roc > 2;
    const supportBreakdownConfirmed =
      lastClose < support * 0.995 && divergence !== "bullish-divergence" && roc < -2;

    //

    // Bearish divergence
    if (lastClose > resistance && roc < this.roc.at(-2)) {
      score.breakdown += 2;
    }

    // Bullish divergence
    if (lastClose < support && roc > this.roc.at(-2)) {
      score.breakout += 2;
    }

    const decision = score.breakout >= baseScore ? "BUY" : score.breakdown >= baseScore ? "SELL" : "HOLD";
    // ... rest of scoring logic adjusted to use these new values

    this.dispatch("LOG", `ROC (${rocPeriod}): ${fixNum(roc)} | SMA: ${fixNum(rocSMA)}`);
  }

  updateTrends(trend) {
    // if (this.trends.at(-1) != trend)
    this.trends.push(trend);
    if (this.trends.length > 12 * 6) this.trends.shift(); // 12 = 1hrs

    // if (!this.trends[0] || this.trends[0] > 15 / this.interval) {
    //   this.trends[0] = 0;
    //   this.trends.push(trend);
    //   if (this.trends.length > 11) {
    //     this.trends.shift();
    //     this.trends[0] = 0;
    //   }
    // }
    // this.trends[0]++;
  }
}

module.exports = BasicTrader;

// Technical Analysis Functions
class Analyzer {
  static findSupportResistance(prices) {
    return {
      support: Math.min(...prices),
      resistance: Math.max(...prices),
    };
  }

  static detectTrend(prices, period = 30) {
    const sma = Analyzer.simpleMovingAverage(prices, period);
    if (sma.slope > 0.05) return "strong-up";
    if (sma.slope < -0.05) return "strong-down";
    return "sideways";
  }

  static calculateVolatility(prices) {
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(Math.abs(prices[i] - prices[i - 1]));
    }
    return changes.reduce((a, b) => a + b, 0) / changes.length;
  }

  static calculateROC(prices) {
    if (prices.length < 2) return null;
    const current = prices.at(0);
    const past = prices.at(-1);
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
}
