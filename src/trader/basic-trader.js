import Trader from "./trader.js";
import { calcPercentageDifference, normalizePrices } from "../services.js";
import { computeDynamicThreshold } from "../indicators.js";
import { detectPriceShape } from "../trend-analysis.js";
import { isNumber } from "../utilities.js";
const calcPct = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = parseInt((60 * 24) / this.interval);
    this.longTerm = false;
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    // this.trends = [];
    // this.lastSellOrderPrice = null;
    this.pausePeriod = 0;
    this.profitTarget = 5;
  }

  async run() {
    // Get data from Kraken
    const storedPrices = await this.ex.prices(this.pair, this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    const { trades } = await this.ex.state.getBot(this.pair);
    const prices = !storedPrices[2] ? [] : normalizePrices(storedPrices, 1.2); // safeAskBidSpread
    if (storedPrices.length < this.range - 1) {
      const days = (this.range * this.interval) / 60 / 24;
      prices = (await this.ex.pricesData(this.pair, this.interval, days)).map((p) => p.close);
    }
    const currentPrice = storedPrices.at(-1) || prices.at(-1);

    if (prices.length < this.range - 1) return this.dispatch("LOG", `No enough prices or low liquidity`);
    // if (this.pausePeriod > 0) this.pausePeriod -= 1;
    if (trades[2] && trades.slice(-3).every((t) => t < 0)) {
      this.longTerm = true;
    } else {
      this.longTerm = false;
    }

    const mode = this.longTerm ? "long-term" : "short-term";
    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${mode} - ${prc}`);

    const sortedPrices = prices.toSorted((a, b) => a - b);
    // const start = prices.at(-1);
    // const lowest = sortedPrices[0];
    const highest = sortedPrices.at(-1);
    const current = prices.at(-1);
    // const percentFromStartToLowest = calcPct(start, lowest);
    // const percentFromStartToHighest = calcPct(start, highest);
    // const percentFromLowestToCurrent = calcPct(lowest, current);
    const percentFromHighestToCurrent = calcPct(highest, current);

    // const last24HrsTrend = linearRegression(prices);
    // const last12HrsTrend = linearRegression(prices.slice(-this.calculateLength(12)));
    const last6HrsTrend = linearRegression(prices.slice(-this.calculateLength(6)));
    // const last2HrTrend = linearRegression(prices.slice(-this.calculateLength(2)));

    const prev3HrTrend = linearRegression(
      prices.slice(prices.length - this.calculateLength(6), prices.length - this.calculateLength(3))
    );
    const last3HrTrend = linearRegression(prices.slice(-this.calculateLength(3)));
    const lastHrTrend = linearRegression(prices.slice(-this.calculateLength(1.5)));
    const { shape } = detectPriceShape(
      prices.slice(-this.calculateLength(0.75)),
      Math.max(Math.min(-percentFromHighestToCurrent / 5, 3), 2)
    );
    const increased = calcPct(last3HrTrend.intercept, prices.at(-1));

    // console.log(calculateVolatility(prices));
    // console.log(calculatePercentVolatility(prices));
    // console.log(
    //   // last24HrsTrend.trend,
    //   // first12HrsTrend.trend,
    //   // last12HrsTrend.trend,
    //   last6HrsTrend.trend,
    //   prev3HrTrend.trend,
    //   last3HrTrend.trend,
    //   lastHrTrend.strength,
    //   increased,
    //   shape,
    //   percentFromHighestToCurrent,
    //   this.profitTarget
    // );

    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      let shouldBuy =
        percentFromHighestToCurrent < -8 &&
        ((prev3HrTrend.trend == "downtrend" &&
          last3HrTrend.trend == "uptrend" &&
          lastHrTrend.trend == "uptrend" &&
          lastHrTrend.strength == "strong" &&
          isNumber(increased, Math.min(-percentFromHighestToCurrent / 4, 2), 3)) ||
          (last6HrsTrend.trend != "downtrend" && shape == "V"));

      // if (this.longTerm) {
      //   shouldBuy =
      //     // first24HrsTrend.trend == "uptrend" &&
      //     // first24HrsTrend.strength != "weak" &&
      //     last24HrsTrend.trend == "downtrend" &&
      //     last12HrsTrend.trend == "downtrend" &&
      //     last6HrsTrend.trend == "uptrend" &&
      //     last2HrTrend.trend == "uptrend";
      // }

      if (shouldBuy && this.pausePeriod <= 0) {
        this.profitTarget = Math.max(Math.min(-percentFromHighestToCurrent / 3, 8), 4);
        await this.buy(balance, currentPrice.askPrice);
        this.dispatch("LOG", `Placed BUY at: ${currentPrice.askPrice}`);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
      }

      // Sell
    } else if (position && balance.crypto > 0) {
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

      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      // gainLossPercent < -1.5 && this.prevGainPercent < 1
      // const longTermCase =
      //   last24HrsTrend.trend != "downtrend" &&
      //   last12HrsTrend.trend == "uptrend" &&
      //   last6HrsTrend.trend == "uptrend" &&
      //   last2HrTrend.trend == "downtrend";

      const shouldSell =
        (this.prevGainPercent > this.profitTarget && loss > 0.5) ||
        (trades.at(-1) > 3 && gainLossPercent > 3 && loss > 1) ||
        gainLossPercent < -1.5 ||
        loss > 4;

      if (shouldSell) {
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        // if (gainLossPercent > 3) this.pausePeriod = (3 * 60) / this.interval;
        this.dispatch("LOG", `Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
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

// Look at: calculatePercentVolatility

// function calculateVolatility(data, period = 14, interval) {
//   const lookBack = { 5: 24, 15: 16, 30: 12, 60: 8 };
//   data = data.slice(-(lookBack[interval] || 24));
//   if (data.length < period) period = data.length;
//   let sum = 0;

//   for (let i = 1; i < period; i++) {
//     sum += (data[i].high - data[i].low) / data[i - 1].close;
//   }
//   return (sum / (period - 1)) * data[data.length - 1].close;
// }

// function calculateVolatility(data, period = 14, interval) {
//   const lookBack = { 5: 24, 15: 16, 30: 12, 60: 8 };
//   data = data.slice(-(lookBack[interval] || 24));
//   if (data.length < period) period = data.length;
//   let sum = 0;

//   for (let i = 1; i < period; i++) {
//     const priceChange = Math.abs(data[i] - data[i - 1]);
//     sum += priceChange / data[i - 1]; // Normalized change
//   }
//   return (sum / (period - 1)) * data[data.length - 1];
// }
