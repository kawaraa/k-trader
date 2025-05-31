import Trader from "./trader.js";
import { calcPercentageDifference, calcAveragePrice, normalizePrices } from "../services.js";
const calcPct = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = (3 * 60) / this.interval;
    this.lookBack = 12 * 3; // 12 = 1hr
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.trends = [];
  }

  async run() {
    // Get data from Kraken
    const pricesData = await this.ex.prices(this.pair, this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    const currentPrice = pricesData.at(-1);

    if (pricesData.length < this.range) return;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    const askBidSpreadPercentage = calcPct(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(pricesData.map((p) => calcPct(p.bidPrice, p.askPrice)));
    const safeAskBidSpread = askBidSpreadPercentage <= Math.min(averageAskBidSpread * 2, 1); // safeAskBidSpread
    const prices = normalizePrices(pricesData, averageAskBidSpread);

    const dropped = calcPct(prices.at(0), prices.at(-1)) >= 5;
    const increasing = calcPct(prices.at(-parseInt(this.range / 4)), prices.at(-1)) >= 1;

    const shouldBuy = dropped && increasing;
    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      if (shouldBuy && safeAskBidSpread) {
        await this.buy(balance, currentPrice.askPrice);
        this.dispatch("LOG", `Placed BUY at: ${currentPrice.askPrice}`);
        this.prevGainPercent = 0;
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

      const shouldSell = (gainLossPercent >= 4 && loss > 1) || gainLossPercent <= -2 || loss >= 3;
      if (shouldSell && safeAskBidSpread) {
        this.dispatch("LOG", this.trends.join("-"));
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        this.dispatch("LOG", `Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    this.dispatch("LOG", "");
  }

  updateTrends(result) {
    // if (result.trend == "sideways") return;
    this.trends.push(result.trend);
    if (this.trends.length > this.lookBack) this.trends.shift();
  }
}

export default BasicTrader;

function linearRegression(data, threshold = 0.0001) {
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
    trend: slope > threshold ? "uptrend" : slope < -threshold ? "downtrend" : "sideways",
    slope: formatDecimal(slope),
    intercept: formatDecimal(intercept),
    r2: formatDecimal(r2),
    strength: r2 > 0.7 ? "strong" : r2 > 0.4 ? "moderate" : "weak",
  };
}
