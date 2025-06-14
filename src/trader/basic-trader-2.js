import Trader from "./trader.js";
import { calcPercentageDifference, calcAveragePrice, normalizePrices } from "../services.js";
import { computeDynamicThreshold } from "../indicators.js";
import { detectPriceShape } from "../trend-analysis.js";
const calcPct = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = parseInt((60 * 24) / this.interval);
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.trends = [];
    this.trades = [];
    this.lastSellOrderPrice = null;
    this.lastTradeTimer = 0;
    this.buyCase1 = false;
  }

  async run() {
    // Get data from Kraken
    const storedPrices = await this.ex.prices(this.pair, this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    // const { trades } = await this.ex.state.getBot(this.pair);
    const prices = !storedPrices[2] ? [] : normalizePrices(storedPrices, 1.2); // safeAskBidSpread
    if (storedPrices.length < this.range - 1) {
      const days = (this.range * this.interval) / 60 / 24;
      // prices = (await this.ex.pricesData(this.pair, this.interval, days)).map((p) => p.close);
    }
    const currentPrice = storedPrices.at(-1) || prices.at(-1);

    if (prices.length < this.range - 1) return this.dispatch("LOG", `No enough prices or low liquidity`);
    // if (this.lastTradeTimer > 0) this.lastTradeTimer -= 1;
    // if (this.trades[2] && this.trades.slice(-3).every((t) => t < 0)) {
    //   this.longTerm = !this.longTerm;
    //   this.trades = [];
    // }

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    const highest = prices.toSorted((a, b) => a - b).at(-1);
    // const last2HrsPrices = prices.slice(-this.calculateLength(2));
    const last15MinsPrices = prices.slice(-this.calculateLength(0.25));

    const length = this.calculateLength(12);
    const last24HrsTrend = linearRegression(prices);
    const first12HrsTrend = linearRegression(prices.slice(0, parseInt(length)));
    const last12HrsTrend = linearRegression(prices.slice(-parseInt(length)));
    const last6HrsTrend = linearRegression(prices.slice(-this.calculateLength(6)));
    const prev2HrTrend = linearRegression(
      prices.slice(prices.length - this.calculateLength(4), prices.length - this.calculateLength(2))
    );
    const last2HrTrend = linearRegression(prices.slice(-this.calculateLength(2)));
    const last24Shape = detectPriceShape(prices, 7);
    const { shape } = detectPriceShape(prices.slice(-this.calculateLength(0.5)), 2);
    // const priceChangeFromStart = calcPct(last24HrsTrend.intercept, prices.at(0));
    // const priceChange = calcPct(last24HrsTrend.intercept, prices.at(-1));
    const priceChange = calcPct(highest, prices.at(-1));

    console.log(
      // last24HrsTrend.trend,
      // first12HrsTrend.trend,
      last12HrsTrend.trend,
      last6HrsTrend.trend,
      // prev2HrTrend.trend,
      last2HrTrend.trend,
      last2HrTrend.strength,
      last24Shape.shape,
      shape,
      highest,
      priceChange
    );

    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      this.buyCase1 = prev2HrTrend.trend == "downtrend" && last2HrTrend.trend == "uptrend";
      this.buyCase2 = shape == "V";
      let shouldBuy = false;
      console.log(this.buyCase1, this.buyCase2);
      if ((priceChange < -10 || last24Shape.shape == "A") && (this.buyCase1 || this.buyCase2)) {
        shouldBuy = true;
      }

      if (shouldBuy) {
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

      const sellCase1 =
        this.buyCase1 &&
        [(last12HrsTrend.trend, last6HrsTrend.trend, last2HrTrend.trend)].every((t) => t == "downtrend");
      const sellCase2 = (this.buyCase2 = shape == "A");
      const shouldSell = sellCase1 || sellCase2 || (gainLossPercent > 5 && loss > 1) || gainLossPercent < -2;
      if (shouldSell) {
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        // this.lastSellOrderPrice = currentPrice.bidPrice;
        this.buyCase1 = false;
        this.buyCase2 = false;
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
