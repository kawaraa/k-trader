import Trader from "./trader.js";
import { calcPercentageDifference, normalizePrices } from "../services.js";
import { computeDynamicThreshold } from "../indicators.js";
import { detectPriceDirection, detectPriceShape } from "../trend-analysis.js";
const calcPct = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = parseInt((60 * 24) / this.interval);
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.lastSellOrderPrice = null;
    this.pausePeriod = 0;
    this.profitTarget = 5;
    this.buyCases = [];
    this.sellCases = [];
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

    if (!position && prices.length < this.range - 1) {
      return this.dispatch("LOG", `No enough prices or low liquidity`);
    }
    if (this.pausePeriod > 0) this.pausePeriod -= 1;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    const sortedPrices = prices.toSorted((a, b) => a - b);
    // const start = prices.at(-1);
    // const lowest = sortedPrices[0];
    const highest = sortedPrices.at(-1);
    const current = prices.at(-1);
    // const percentFromStartToLowest = calcPct(start, lowest);
    // const percentFromStartToHighest = calcPct(start, highest);
    // const percentFromLowestToCurrent = calcPct(lowest, current);
    const percentFromHighestToCurrent = calcPct(highest, current);
    const vLimit = Math.max(Math.min(-percentFromHighestToCurrent / 5, 3), 2);
    const increaseLimit = Math.max(Math.min(-percentFromHighestToCurrent / 4, 2), 3);

    const pricesFor6hrs = prices.slice(
      prices.length - this.calculateLength(12),
      prices.length - this.calculateLength(6)
    );

    // const last24HrsTrend = linearRegression(prices);
    // const first12HrsTrend = linearRegression(prices.slice(0, this.calculateLength(12)));
    const last12HrsTrend = linearRegression(prices.slice(-this.calculateLength(12)));
    const last6HrsTrend = linearRegression(pricesFor6hrs);
    // const last2HrTrend = linearRegression(prices.slice(-this.calculateLength(2)));

    const prev3HrTrend = linearRegression(
      prices.slice(prices.length - this.calculateLength(6), prices.length - this.calculateLength(3))
    );
    const last3HrTrend = linearRegression(prices.slice(-this.calculateLength(3)));
    const lastHrTrend = detectPriceDirection(prices.slice(-this.calculateLength(1.5)), increaseLimit);
    const pattern3 = detectPriceShape(prices.slice(-this.calculateLength(0.75)), vLimit);
    const pattern2 = detectPriceShape(prices, 5);
    const pattern1 = detectPriceShape(prices.slice(0, pattern2.index), 3);
    const dropped = percentFromHighestToCurrent < -10;
    const priceTooHigh = this.lastSellOrderPrice && calcPct(this.lastSellOrderPrice, current) > 5;

    // console.log(
    //   percentFromHighestToCurrent,
    //   this.profitTarget,
    //   // last24HrsTrend.trend,
    //   // first12HrsTrend.trend,
    //   last12HrsTrend.trend,
    //   last6HrsTrend.trend,
    //   prev3HrTrend.trend,
    //   last3HrTrend.trend,
    //   lastHrTrend,
    //   pattern1.shape,
    //   pattern2.shape,
    //   pattern3.shape,
    //   increaseLimit,
    //   vLimit
    // );

    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      const uptrend = lastHrTrend == "uptrend";
      const v = pattern3.shape == "V";
      const up = prices.at(-2) < prices.at(-1);

      this.buyCases[0] =
        dropped &&
        [last12HrsTrend.trend, last6HrsTrend.trend, prev3HrTrend.trend].every((t) => t == "downtrend") &&
        [last3HrTrend.trend, lastHrTrend].some((t) => t != "downtrend") &&
        (v || uptrend);

      this.buyCases[1] =
        dropped && prev3HrTrend.trend == "downtrend" && last3HrTrend.trend == "uptrend" && (v || uptrend);

      this.buyCases[2] = pattern1.shape == "V" && pattern2.shape == "A" && (v || uptrend);

      this.buyCases[3] =
        !priceTooHigh &&
        percentFromHighestToCurrent > -1 &&
        [
          last12HrsTrend.trend,
          last6HrsTrend.trend,
          prev3HrTrend.trend,
          last3HrTrend.trend,
          lastHrTrend,
        ].every((t) => t != "downtrend") &&
        calcPct(prices.at(-this.calculateLength(0.5)), current) > 1;

      if (this.buyCases[3]) this.lastSellOrderPrice = current;

      if (this.buyCases.some((c) => c) && up && this.pausePeriod <= 0) {
        this.profitTarget = +Math.max(Math.min(-percentFromHighestToCurrent / 3, 8), 4).toFixed(2);
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

      const shouldSell = (this.prevGainPercent > this.profitTarget && loss > 0.5) || gainLossPercent <= -5;

      if (shouldSell) {
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        if (gainLossPercent > 3) this.pausePeriod = 60 / this.interval;
        if (this.buyCases[3] || (trades[1] && trades.slice(-2).every((t) => t < -3))) {
          this.pausePeriod = (24 * 60) / this.interval;
        }
        this.buyCases.forEach((c) => (c = false));
        this.dispatch("LOG", `Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }

      //
    } else {
      // this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
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
