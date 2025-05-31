import Trader from "./trader.js";
import { calcPercentageDifference, calcAveragePrice, normalizePrices } from "../services.js";
import { computeDynamicThreshold } from "../indicators.js";
const calcPct = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = parseInt((6 * 60) / this.interval);
    this.lookBack = 12 * 1; // 12 = 1hr
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.trends = [];
    this.priceBaselineChange = 0;
    this.lastTradeTimer = 0;
    this.buyCase1 = false;
    this.buyCase2 = false;
    this.buyCase3 = false;
  }

  async run() {
    // Get data from Kraken
    const pricesData = await this.ex.prices(this.pair, parseInt((24 * 60) / this.interval));
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    const currentPrice = pricesData.at(-1);

    if (pricesData.length < this.range) return;
    if (this.lastTradeTimer > 0) this.lastTradeTimer -= 1;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    const askBidSpreadPercentage = calcPct(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(pricesData.map((p) => calcPct(p.bidPrice, p.askPrice)));
    const safeAskBidSpread = askBidSpreadPercentage <= Math.min(averageAskBidSpread * 2, 1); // safeAskBidSpread
    const prices = normalizePrices(pricesData, averageAskBidSpread);

    // const { trend, strength, intercept } = linearRegression(prices);
    const last24HrsTrend = linearRegression(prices);
    const first12HrsTrend = linearRegression(prices.slice(0, this.calculateLength(12)));
    const last12HrsTrend = linearRegression(prices.slice(-this.calculateLength(12)));
    const last6HrsTrend = linearRegression(prices.slice(-this.calculateLength(6)));
    const lastHrTrend = linearRegression(prices.slice(-this.calculateLength(2)));
    const priceChangeFromStart = calcPct(last24HrsTrend.intercept, prices.at(0));
    const priceChange = calcPct(last24HrsTrend.intercept, prices.at(-1));
    // priceChange 0 - 1 || priceChange -2 - -5

    const breakdown =
      last24HrsTrend.trend == "downtrend" &&
      first12HrsTrend.trend == "downtrend" &&
      last12HrsTrend.trend == "downtrend";

    // if (priceChange > 2) {
    //   buyCase2 =
    //     first12HrsTrend.trend == "uptrend" &&
    //     last12HrsTrend.trend == "uptrend" &&
    //     last6HrsTrend.trend == "downtrend" &&
    //     lastHrTrend.trend == "uptrend" &&
    //     priceChange - this.priceBaselineChange > 1;
    // }
    // buyCase3 =
    //   last6HrsTrend.trend == "uptrend" &&
    //   lastHrTrend.trend == "uptrend" &&
    //   priceChange - this.priceBaselineChange > 1;

    // this.priceBaselineChange < -3 &&  priceChange - this.priceBaselineChange >= 1;

    // loss > 1

    // console.log(this.trends.join("-"));
    // console.log("48=>", trend, strength);
    console.log("24=>", last24HrsTrend.trend, last24HrsTrend.strength);
    console.log("F 12=>", first12HrsTrend.trend, first12HrsTrend.strength);
    console.log("S 12=>", last12HrsTrend.trend, last12HrsTrend.strength);
    console.log("6=>", last6HrsTrend.trend, last6HrsTrend.strength);
    console.log("1=>", lastHrTrend.trend, lastHrTrend.strength);
    console.log(priceChangeFromStart, priceChange, this.priceBaselineChange, "\n");

    // const down = this.trends.slice(-parseInt(this.lookBack / 2)).every((t) => t == "downtrend");
    // const down = this.trends.every((t) => t == "downtrend");
    // const up = this.trends.every((t) => t == "uptrend");

    // const buy =
    //   down &&
    //   priceChange < -2 &&
    //   ((lastHrTrend.trend == "uptrend" && lastHrTrend.strength == "strong") ||
    //     (shortPeriodTrend.trend == "uptrend" && lastHrTrend.trend == "uptrend"));

    // const sell =
    //   up &&
    //   priceChange > 2 &&
    //   ((lastHrTrend.trend == "downtrend" && lastHrTrend.strength == "strong") ||
    //     (shortPeriodTrend.trend == "downtrend" && lastHrTrend.trend == "downtrend"));

    // let shouldBuy = this.trends.length >= this.lookBack - 1 && buy;
    // let shouldBuy = buy && !breakdown && lastHrTrend.trend == "uptrend";

    // Buy:
    // 1. priceChange < -3 && last24HrsTrend.trend=="downtrend"&& first12HrsTrend.trend=="downtrend" && last12HrsTrend.trend=="downtrend" && last6HrsTrend.trend=="downtrend" && lastHrTrend.trend=="uptrend"
    // Sell:
    // 1. last24HrsTrend.trend=="downtrend"&& first12HrsTrend.trend=="downtrend" && last12HrsTrend.trend=="downtrend" && last6HrsTrend.trend=="downtrend" && lastHrTrend.trend=="downtrend"
    // 2. priceChange - this.priceBaselineChange <= -1

    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      if (priceChange < this.priceBaselineChange) this.priceBaselineChange = priceChange;

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

      console.log("buy:", this.buyCase1, this.buyCase2, this.buyCase3);
      if ((this.buyCase1 || this.buyCase2 || this.buyCase3) && safeAskBidSpread && this.lastTradeTimer <= 0) {
        await this.buy(balance, currentPrice.askPrice);
        this.prevGainPercent = 0;
        this.priceBaselineChange = priceChange;
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

      // const breakout =
      //   last12HrsTrend.trend == "uptrend" &&
      //   last12HrsTrend.strength != "weak" &&
      //   last6HrsTrend.trend == "uptrend" &&
      //   last6HrsTrend.strength != "weak" &&
      //   lastHrTrend.trend == "uptrend" &&
      //   lastHrTrend.strength != "weak";
      // const stopLoss = gainLossPercent <= -4 || (gainLossPercent > 3 && loss > 1);
      const stopLoss = (gainLossPercent > 3 && loss > 1) || loss > 3;

      const sellCase1 =
        last12HrsTrend.trend == "downtrend" &&
        last6HrsTrend.trend == "downtrend" &&
        lastHrTrend.trend == "downtrend";

      const sellCase2 =
        first12HrsTrend.trend != "uptrend" &&
        last12HrsTrend.trend != "downtrend" &&
        last6HrsTrend.trend == "uptrend" &&
        lastHrTrend.trend == "downtrend" &&
        priceChange - this.priceBaselineChange < -1;

      const sellCase3 = this.buyCase2 && this.prevGainPercent > 1 && this.prevGainPercent < 3 && loss > 0.5;
      /**
          F 12=> uptrend weak
          S 12=> downtrend weak
          6=> sideways weak
          1=> downtrend weak
     */

      console.log("sell:", stopLoss, sellCase1, sellCase2, sellCase3);
      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      const shouldSell = (gainLossPercent >= 2 && loss > 1) || gainLossPercent <= -2 || loss >= 2;
      // || gainLossPercent <= -4 || (this.prevGainPercent > 3 && loss > 1)
      if ((stopLoss || sellCase1 || sellCase2 || sellCase3) && safeAskBidSpread) {
        // this.dispatch("LOG", this.trends.join("-"));
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        this.losses = [0, 0, 0];
        this.priceBaselineChange = priceChange;
        if (gainLossPercent > 1 || sellCase3) this.lastTradeTimer = (res.age * 60) / this.interval;
        this.buyCase1 = false;
        this.buyCase2 = false;
        this.buyCase3 = false;
        this.dispatch("LOG", `Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    // priceChange - this.priceBaselineChange;
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

  updateTrends(result) {
    // if (result.trend == "sideways") return;
    //  if (result.strength != "strong") return;
    this.trends.push(result.trend);
    if (this.trends.length > this.lookBack) this.trends.shift();
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
