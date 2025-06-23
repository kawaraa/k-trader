import Trader from "./trader.js";
import { calcPercentageDifference, normalizePrices } from "../services.js";
import { computeDynamicThreshold } from "../indicators.js";
import { detectPriceDirection, detectPriceShape } from "../trend-analysis.js";
const calcPct = calcPercentageDifference;

// Smart trader
class ScalpTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = parseInt((3 * 60 * 60) / this.interval);
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.lastSellOrderPrice = null;
    this.profitTarget = 4;
    this.buyCases = [];
    this.sellCases = [];
  }

  async run() {
    // Get data from Kraken
    const storedPrices = await this.ex.prices(this.pair, this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    const { trades } = await this.ex.state.getBot(this.pair);
    const prices = normalizePrices(storedPrices); // safeAskBidSpread
    const currentPrice = storedPrices.at(-1);
    const sortedPrices = prices.toSorted((a, b) => a - b);

    // const sortedPrices = prices.toSorted((a, b) => a - b);
    // const start = prices.at(-1);
    const lowest = sortedPrices[0];
    const highest = sortedPrices.at(-1);
    const current = prices.at(-1);
    // const percentFromStartToLowest = calcPct(start, lowest);
    // const percentFromStartToHighest = calcPct(start, highest);
    // const percentFromLowestToCurrent = calcPct(lowest, current);
    const volatility = calcPct(lowest, highest);
    const droppedPercent = calcPct(highest, current);
    const increasedPercent = calcPct(lowest, current);
    // const vLimit = Math.max(Math.min(-droppedPercent / 5, 3), 2);
    // const increaseLimit = Math.max(Math.min(-droppedPercent / 4, 2), 3);

    const allPricesTrend = linearRegression(prices);
    const halfPricesTrend = linearRegression(prices.slice(-parseInt(prices.length / 2)));
    const lastMinTrend = detectPriceDirection(prices.slice(-24), 1);
    // const pattern3 = detectPriceShape(prices.slice(-this.calculateLength(0.75)), vLimit);
    // const pattern2 = detectPriceShape(prices, 5);
    // const pattern1 = detectPriceShape(prices.slice(0, pattern2.index), 3);
    const dropped = droppedPercent < -3;
    // const up = prices.at(-2) < prices.at(-1);

    const log = `Drops: ${droppedPercent} - Trend: ${lastMinTrend} - Price: ${prices.at(-1)}`;
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - volatility: ${volatility} - ${log}`);
    this.dispatch("LOG", JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", "));
    this.dispatch("LOG", `allPricesTrend: ${JSON.stringify(allPricesTrend)}`);
    this.dispatch("LOG", `halfPricesTrend: ${JSON.stringify(halfPricesTrend)}`);
    // this.dispatch("LOG", `pattern1: ${JSON.stringify(pattern1)}`);
    // this.dispatch("LOG", `pattern2: ${JSON.stringify(pattern2)}`);
    // this.dispatch("LOG", `pattern3: ${JSON.stringify(pattern3)}`);

    // Todo: Test this
    // if (volatility > 1.5 && dropped < -(volatility / 1.1)) console.log("BUY");
    // if (gainLoss >= 1.5) console.log("SELL");
    if (!this.lastSellOrderPrice && dropped && lastMinTrend == "uptrend") {
      this.dispatch("LOG", `Place BUY`);
      this.dispatch("BUY_SIGNAL", currentPrice.askPrice);
      this.lastSellOrderPrice = current;
    } else if (this.lastSellOrderPrice) {
      const gainLoss = calcPct(this.lastSellOrderPrice, current);
      if (increasedPercent > 2 && lastMinTrend == "downtrend") {
        this.dispatch("LOG", `Place SELL ${gainLoss}`);
        this.lastSellOrderPrice = null;
      } else if (gainLoss < -1 && lastMinTrend == "downtrend") {
        this.dispatch("LOG", `Place STOP_LOSS`);
        this.lastSellOrderPrice = null;
      }
    }

    const safeAskBidSpread = calcPct(currentPrice.bidPrice, currentPrice.askPrice) <= 1;
    if (!safeAskBidSpread) return this.dispatch("LOG", `Low liquidity`);

    this.buyCases[0] = false;

    // Buy
    if (!position && this.capital > 0 && balance.eur >= 1) {
      if (this.buyCases.some((c) => c)) {
        if (this.notifiedTimer <= 0) {
          this.dispatch("LOG", `BUY Signal case: ${this.buyCases.findIndex((c) => c)}`);
          this.dispatch("BUY_SIGNAL", currentPrice.askPrice);
          this.notifiedTimer = (1 * 60) / this.interval;
        }

        if (this.pauseTimer <= 0) {
          this.profitTarget = +Math.max(Math.min(-droppedPercent / 3, 8), 4).toFixed(2);
          await this.buy(balance, currentPrice.askPrice);
          this.dispatch("LOG", `Placed BUY at: ${currentPrice.askPrice}`);
          this.prevGainPercent = 0;
          this.losses = [0, 0, 0];
        }
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

      const shouldSell =
        (volatility < 6 && gainLossPercent >= Math.max(2, volatility / 2.5) && loss > 0.5) ||
        (this.prevGainPercent >= this.profitTarget && loss > 0.5) ||
        (volatility > 3 && gainLossPercent <= -2) ||
        (this.prevGainPercent > 2 && gainLossPercent <= -1);

      if (shouldSell) {
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        if (gainLossPercent > 3) this.pauseTimer = 60 / this.interval;
        if (this.buyCases[4] || (trades[1] && trades.slice(-2).every((t) => t < -3))) {
          this.pauseTimer = (24 * 60) / this.interval;
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

export default ScalpTrader;

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
    slope: formatDecimal(slope, 6),
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
