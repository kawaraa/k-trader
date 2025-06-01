import Trader from "./trader.js";
import { calcPercentageDifference, calcAveragePrice, normalizePrices } from "../services.js";
import { computeDynamicThreshold } from "../indicators.js";
const calcPct = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, strategy, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = parseInt((60 * 48) / this.interval);
    this.strategy = strategy || "short-term";
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.priceBaselineChange = 0;
    this.lastTradeTimer = 0;
    this.pausePeriod = 0;
    this.buyCase1 = false;
    this.buyCase2 = false;
    this.buyCase3 = false;
    this.buyCase4 = false;
  }

  async run() {
    // Get data from Kraken
    const pricesData = await this.ex.prices(this.pair, this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    const { trades } = await this.ex.state.getBot(this.pair);
    const currentPrice = pricesData.at(-1);

    if (pricesData.length < this.range) return;
    if (this.lastTradeTimer > 0) this.lastTradeTimer -= 1;
    if (this.pausePeriod > 1) this.pausePeriod -= 1;
    else if (!this.pausePeriod && trades[2] && trades.slice(-3).every((t) => t < 0)) {
      // trades.slice(-10).reduce((ac, t) => ac + t, 0) <= -10
      this.pausePeriod = this.calculateLength(24);
    }
    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    const askBidSpreadPercentage = calcPct(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(pricesData.map((p) => calcPct(p.bidPrice, p.askPrice)));
    const safeAskBidSpread = askBidSpreadPercentage <= Math.min(averageAskBidSpread * 2, 1); // safeAskBidSpread
    const prices = normalizePrices(pricesData, averageAskBidSpread);

    const length = this.calculateLength(12);
    // const last48HrsTrend = linearRegression(prices);
    const first24HrsTrend = linearRegression(prices.slice(0, length * 2));
    const last24HrsTrend = linearRegression(prices.slice(-(length * 2)));
    const first12HrsTrend = linearRegression(prices.slice(length * 2, -length));
    const last12HrsTrend = linearRegression(prices.slice(-length));
    const last6HrsTrend = linearRegression(prices.slice(-this.calculateLength(6)));
    const lastHrTrend = linearRegression(prices.slice(-this.calculateLength(2)));
    // const priceChangeFromStart = calcPct(last24HrsTrend.intercept, prices.at(0));
    const priceChange = calcPct(last24HrsTrend.intercept, prices.at(-1));
    // const priceChange24 = calcPct(last48HrsTrend.intercept, prices.at(-1));

    // console.log("48 strategy:", this.buyCase4);
    // // sideways weak sideways downtrend uptrend uptrend downtrend weak
    // console.log(
    //   first24HrsTrend.trend,
    //   first24HrsTrend.strength,
    //   last24HrsTrend.trend,
    //   first12HrsTrend.trend,
    //   last12HrsTrend.trend,
    //   last6HrsTrend.trend,
    //   lastHrTrend.trend,
    //   lastHrTrend.strength,
    //   priceChange24
    // );
    // console.log(priceChange, this.priceBaselineChange);

    if (this.pausePeriod > 1 && priceChange < 2) return console.log("STOP");
    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      if (priceChange < this.priceBaselineChange) this.priceBaselineChange = priceChange;

      if (this.strategy == "long-term") {
        this.buyCase1 = false;
        this.buyCase2 = false;
        this.buyCase3 = false;
        this.buyCase4 =
          first24HrsTrend.trend == "uptrend" &&
          first24HrsTrend.strength != "weak" &&
          last24HrsTrend.trend == "downtrend" &&
          last12HrsTrend.trend == "downtrend" &&
          last6HrsTrend.trend == "uptrend" &&
          lastHrTrend.trend == "uptrend";
      } else {
        this.buyCase1 =
          (first12HrsTrend.trend != "downtrend" &&
            last12HrsTrend.trend == "downtrend" &&
            last6HrsTrend.trend == "downtrend" &&
            lastHrTrend.trend == "uptrend" &&
            lastHrTrend.strength != "weak" &&
            priceChange <= -2 &&
            priceChange - this.priceBaselineChange >= 1) ||
          (last24HrsTrend.trend == "uptrend" &&
            first12HrsTrend.trend == "uptrend" &&
            first12HrsTrend.strength == "strong" &&
            last12HrsTrend.trend == "downtrend" &&
            last12HrsTrend.strength == "strong" &&
            last6HrsTrend.trend == "downtrend" &&
            lastHrTrend.trend == "uptrend");

        this.buyCase2 =
          priceChange <= -2 &&
          first12HrsTrend.trend == "downtrend" &&
          last12HrsTrend.trend == "downtrend" &&
          ((last6HrsTrend.trend == "uptrend" &&
            lastHrTrend.trend == "uptrend" &&
            lastHrTrend.strength == "strong") ||
            (last6HrsTrend.trend == "uptrend" &&
              last6HrsTrend.strength == "moderate" &&
              lastHrTrend.trend == "uptrend" &&
              lastHrTrend.strength == "moderate"));

        this.buyCase3 =
          priceChange <= -2 &&
          first12HrsTrend.trend == "downtrend" &&
          last12HrsTrend.trend == "sideways" &&
          last6HrsTrend.trend == "sideways" &&
          lastHrTrend.trend == "uptrend" &&
          lastHrTrend.strength == "strong";

        this.buyCase4 = false;
      }

      // const breakout =
      //   first12HrsTrend.trend == "uptrend" &&
      //   last12HrsTrend.trend == "uptrend" &&
      //   last12HrsTrend.strength != "weak" &&
      //   last6HrsTrend.trend == "uptrend" &&
      //   last6HrsTrend.strength != "weak" &&
      //   lastHrTrend.trend == "uptrend" &&
      //   lastHrTrend.strength != "weak";

      console.log("buy:", this.buyCase1, this.buyCase2, this.buyCase3, this.buyCase4);
      if (
        (this.buyCase1 || this.buyCase2 || this.buyCase3 || this.buyCase4) &&
        safeAskBidSpread &&
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

      if (this.strategy == "long-term") {
        this.stopLoss = false;
        this.sellCase1 = false;
        this.sellCase2 = false;
        this.sellCase3 = false;
        this.sellCas4 =
          (first24HrsTrend.trend != "uptrend" &&
            last24HrsTrend.trend != "downtrend" &&
            last12HrsTrend.trend == "uptrend" &&
            last6HrsTrend.trend == "uptrend" &&
            lastHrTrend.trend == "downtrend") ||
          (last24HrsTrend.trend == "downtrend" &&
            last12HrsTrend.trend == "downtrend" &&
            last6HrsTrend.trend == "downtrend");

        // downtrend downtrend downtrend downtrend downtrend
      } else {
        this.stopLoss = (gainLossPercent > 3 && loss > 1) || loss > 3;

        this.sellCase1 =
          last12HrsTrend.trend == "downtrend" &&
          last6HrsTrend.trend == "downtrend" &&
          lastHrTrend.trend == "downtrend";

        this.sellCase2 =
          first12HrsTrend.trend != "uptrend" &&
          last12HrsTrend.trend != "downtrend" &&
          last6HrsTrend.trend == "uptrend" &&
          lastHrTrend.trend == "downtrend" &&
          priceChange - this.priceBaselineChange < -1;

        this.sellCase3 = this.buyCase2 && this.prevGainPercent > 1 && this.prevGainPercent < 3 && loss > 0.5;
      }

      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      console.log("sell:", this.stopLoss, this.sellCase1, this.sellCase2, this.sellCase3, this.sellCas4);
      if (
        (this.stopLoss || this.sellCase1 || this.sellCase2 || this.sellCase3 || this.sellCas4) &&
        safeAskBidSpread
      ) {
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
        this.dispatch("LOG", `Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    if (
      !position &&
      last12HrsTrend.trend == "uptrend" &&
      last6HrsTrend.trend == "uptrend" &&
      lastHrTrend.trend == "uptrend"
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
