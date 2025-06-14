import Trader from "./trader.js";
import { calcPercentageDifference, normalizePrices } from "../services.js";
import { computeDynamicThreshold } from "../indicators.js";
// import { detectPriceShape } from "../trend-analysis.js";
const calcPct = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = parseInt((60 * 48) / this.interval);
    this.longTerm = false;
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.priceBaselineChange = 0;
    this.lastTradeTimer = 0;
    this.trades = [];
    this.buyCase1 = false;
    this.buyCase2 = false;
    this.buyCase3 = false;
    this.buyCase4 = false;
  }

  async run() {
    // Get data from Kraken
    // const closes = (await this.ex.pricesData(this.pair, this.interval, 2)).slice(-20).map((p) => p.close);
    const storedPrices = await this.ex.prices(this.pair, this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    // const { trades } = await this.ex.state.getBot(this.pair);
    let prices = !storedPrices[2] ? [] : normalizePrices(storedPrices, 1.2); // safeAskBidSpread
    if (storedPrices.length < this.range - 1) {
      const days = (this.range * this.interval) / 60 / 24;
      // prices = (await this.ex.pricesData(this.pair, this.interval, days)).map((p) => p.close);
    }
    const currentPrice = storedPrices.at(-1) || prices.at(-1);

    if (prices.length < this.range - 1) return this.dispatch("LOG", `No enough prices or low liquidity`);
    if (this.lastTradeTimer > 0) this.lastTradeTimer -= 1;
    if (this.trades[2] && this.trades.slice(-3).every((t) => t < 0)) {
      this.longTerm = !this.longTerm;
      this.trades = [];
    }

    // console.log("volatility", calculatePercentVolatility(prices));
    const mode = this.longTerm ? "long-term" : "short-term";
    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${mode} - ${prc}`);

    const length = this.calculateLength(12);
    const first24Prices = prices.slice(0, length * 2);
    const last24Prices = prices.slice(-(length * 2));

    // const last48HrsTrend = linearRegression(prices);
    const first24HrsTrend = linearRegression(first24Prices);
    const last24HrsTrend = linearRegression(last24Prices);
    const first12HrsTrend = linearRegression(last24Prices.slice(0, parseInt(length)));
    const last12HrsTrend = linearRegression(last24Prices.slice(-parseInt(length)));
    const last6HrsTrend = linearRegression(last24Prices.slice(-this.calculateLength(6)));
    const last2HrTrend = linearRegression(last24Prices.slice(-this.calculateLength(2)));
    // const { shape } = detectPriceShape(last24Prices.slice(-this.calculateLength(1)), 1.5);
    // const priceChangeFromStart = calcPct(last24HrsTrend.intercept, prices.at(0));
    const priceChange = calcPct(last24HrsTrend.intercept, prices.at(-1));
    // const priceChange48 = calcPct(last48HrsTrend.intercept, prices.at(-1));

    // console.log(
    //   first24HrsTrend.trend,
    //   first24HrsTrend.strength,
    //   last24HrsTrend.trend,
    //   last24HrsTrend.strength,
    //   first12HrsTrend.trend,
    //   first12HrsTrend.strength,
    //   last12HrsTrend.trend,
    //   last12HrsTrend.strength,
    //   last6HrsTrend.trend,
    //   last6HrsTrend.strength,
    //   last2HrTrend.trend,
    //   last2HrTrend.strength
    // );
    // console.log(priceChange, this.priceBaselineChange);

    if (this.pausePeriod > 1) return this.dispatch("LOG", `STOP`);

    // Buy
    if (!position && this.capital > 0) {
      if (priceChange < this.priceBaselineChange) this.priceBaselineChange = priceChange;

      if (this.longTerm) {
        this.buyCase1 = false;
        this.buyCase2 = false;
        this.buyCase3 = false;
        this.buyCase4 = false;
        this.buyCase5 =
          first24HrsTrend.trend == "uptrend" &&
          first24HrsTrend.strength != "weak" &&
          last24HrsTrend.trend == "downtrend" &&
          last12HrsTrend.trend == "downtrend" &&
          last6HrsTrend.trend == "uptrend" &&
          last2HrTrend.trend == "uptrend";
      } else {
        this.buyCase1 =
          (first12HrsTrend.trend != "downtrend" &&
            last12HrsTrend.trend == "downtrend" &&
            last6HrsTrend.trend == "downtrend" &&
            last2HrTrend.trend == "uptrend" &&
            last2HrTrend.strength != "weak" &&
            priceChange <= -2 &&
            priceChange - this.priceBaselineChange >= 1) ||
          (last24HrsTrend.trend == "uptrend" &&
            first12HrsTrend.trend == "uptrend" &&
            first12HrsTrend.strength == "strong" &&
            last12HrsTrend.trend == "downtrend" &&
            last12HrsTrend.strength == "strong" &&
            last6HrsTrend.trend == "downtrend" &&
            last2HrTrend.trend == "uptrend");

        this.buyCase2 =
          priceChange <= -2 &&
          first12HrsTrend.trend == "downtrend" &&
          last12HrsTrend.trend == "downtrend" &&
          ((last6HrsTrend.trend == "uptrend" &&
            last2HrTrend.trend == "uptrend" &&
            last2HrTrend.strength == "strong") ||
            (last6HrsTrend.trend == "uptrend" &&
              last6HrsTrend.strength == "moderate" &&
              last2HrTrend.trend == "uptrend" &&
              last2HrTrend.strength == "moderate"));

        this.buyCase3 =
          priceChange <= -2 &&
          first12HrsTrend.trend == "downtrend" &&
          last12HrsTrend.trend == "sideways" &&
          last6HrsTrend.trend == "sideways" &&
          last2HrTrend.trend == "uptrend" &&
          last2HrTrend.strength == "strong";

        // this.buyCase4 = last12HrsTrend.trend == "downtrend" && shape == "V";
        this.buyCase5 = false;
      }

      // const breakout =
      //   first12HrsTrend.trend == "uptrend" &&
      //   last12HrsTrend.trend == "uptrend" &&
      //   last12HrsTrend.strength != "weak" &&
      //   last6HrsTrend.trend == "uptrend" &&
      //   last6HrsTrend.strength != "weak" &&
      //   last2HrTrend.trend == "uptrend" &&
      //   last2HrTrend.strength != "weak";

      this.dispatch(
        "LOG",
        `buy: ${this.buyCase1} ${this.buyCase2} ${this.buyCase3} ${this.buyCase4} ${this.buyCase5}`
      );
      if (
        (this.buyCase1 || this.buyCase2 || this.buyCase3 || this.buyCase4 || this.buyCase5) &&
        this.lastTradeTimer <= 0
      ) {
        await this.buy(balance, currentPrice.askPrice);
        this.prevGainPercent = 0;
        this.priceBaselineChange = priceChange;
        this.stopLoss = false;
        this.sellCase1 = false;
        this.sellCase2 = false;
        this.sellCase3 = false;
        this.sellCas4 = false;
        this.dispatch("LOG", `Placed BUY at: ${currentPrice.askPrice}`);
      }

      // Sell
    } else if (position && balance.crypto > 0) {
      if (priceChange > this.priceBaselineChange) this.priceBaselineChange = priceChange;

      const gainLossPercent = calcPct(position.price, prices.at(-1));
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);

      if (-gainLossPercent >= this.losses[0]) this.losses[0] = -gainLossPercent;
      else if (this.losses[0]) {
        if (gainLossPercent > 0) this.losses[1] = this.losses[0];
        else {
          const recoveredPercent = +(this.losses[0] - -gainLossPercent).toFixed(2);
          if (recoveredPercent > this.losses[1]) this.losses[1] = recoveredPercent;
        }
      }

      if (this.longTerm) {
        this.stopLoss = false;
        this.sellCase1 = false;
        this.sellCase2 = false;
        this.sellCase3 = false;
        this.sellCas4 =
          (first24HrsTrend.trend != "uptrend" &&
            last24HrsTrend.trend != "downtrend" &&
            last12HrsTrend.trend == "uptrend" &&
            last6HrsTrend.trend == "uptrend" &&
            last2HrTrend.trend == "downtrend") ||
          (last24HrsTrend.trend == "downtrend" &&
            last12HrsTrend.trend == "downtrend" &&
            last6HrsTrend.trend == "downtrend");

        // downtrend downtrend downtrend downtrend downtrend
      } else {
        this.stopLoss = (gainLossPercent > 3 && loss > 1) || loss > 3;

        this.sellCase1 =
          !this.buyCase4 &&
          last12HrsTrend.trend == "downtrend" &&
          last6HrsTrend.trend == "downtrend" &&
          last2HrTrend.trend == "downtrend";

        this.sellCase2 =
          first12HrsTrend.trend != "uptrend" &&
          last12HrsTrend.trend != "downtrend" &&
          last6HrsTrend.trend == "uptrend" &&
          last2HrTrend.trend == "downtrend" &&
          priceChange - this.priceBaselineChange < -1;

        this.sellCase3 =
          (this.buyCase2 || this.buyCase4) &&
          this.prevGainPercent > 1 &&
          this.prevGainPercent < 3 &&
          loss > 0.5;
      }

      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      this.dispatch(
        "LOG",
        `sell: ${this.stopLoss} ${this.sellCase1} ${this.sellCase2} ${this.sellCase3} ${this.sellCas4}`
      );

      if (this.stopLoss || this.sellCase1 || this.sellCase2 || this.sellCase3 || this.sellCas4) {
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        this.losses = [0, 0, 0];
        this.priceBaselineChange = priceChange;
        if (gainLossPercent > 1 || this.sellCase3) {
          this.lastTradeTimer = (res.age * 60) / this.interval;
          this.pausePeriod = 0;
        }
        this.buyCase1 = false;
        this.buyCase2 = false;
        this.buyCase3 = false;
        this.buyCase4 = false;
        this.buyCase5 = false;

        this.trades.push(gainLossPercent);
        this.dispatch("LOG", `Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }

      //
    } else {
      this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    if (
      !position &&
      last12HrsTrend.trend == "uptrend" &&
      last6HrsTrend.trend == "uptrend" &&
      last2HrTrend.trend == "uptrend"
    ) {
      this.priceBaselineChange = priceChange;
    }

    this.dispatch("LOG", "");
  }
}

export default BasicTrader;

function linearRegression(data, threshold) {
  if (!data || data.length < 2) return { trend: "none", slope: 0, intercept: 0, r2: 0 };
  threshold = threshold < 1 ? threshold : computeDynamicThreshold(data);
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
    trend: slope > threshold ? "uptrend" : slope < -threshold ? "downtrend" : "sideways",
    slope: formatDecimal(slope),
    intercept: formatDecimal(intercept),
    r2: formatDecimal(r2),
    strength: r2 > 0.7 ? "strong" : r2 > 0.4 ? "moderate" : "weak",
  };
}
