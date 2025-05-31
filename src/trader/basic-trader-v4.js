import Trader from "./trader.js";
import { calcPercentageDifference, calcAveragePrice, normalizePrices } from "../services.js";
import { computeDynamicThreshold } from "../indicators.js";
const calcPct = calcPercentageDifference;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = (2 * 24 * 60) / this.interval;
    this.lookBack = 12 * 6; // 12 = 1hr
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.trends = [];
    this.lastTradeTimer = 0;
    this.priceBaselineChange = 0;
  }

  async run() {
    // Get data from Kraken
    const pricesData = await this.ex.prices(this.pair, this.range);
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
    const nearLowChange = calcPct(prices.toSorted((a, b) => a - b)[0], prices.at(-1));

    // const average = calcAveragePrice(prices);
    const { trend, intercept } = linearRegression(prices, 0);
    const last24HrsTrend = linearRegression(prices.slice(-parseInt((24 * 60) / this.interval)), 0);
    const last12HrsTrend = linearRegression(prices.slice(-parseInt((12 * 60) / this.interval)), 0);
    const last6HrsTrend = linearRegression(prices.slice(-parseInt((6 * 60) / this.interval)), 0);
    const last3HrsTrend = linearRegression(prices.slice(-parseInt((3 * 60) / this.interval)), 0);
    const priceChange = calcPct(intercept, prices.at(-1));
    const allTrends = `${last24HrsTrend.trend}-${last12HrsTrend.trend}-${last6HrsTrend.trend}-${last3HrsTrend.trend}`;

    // uptrend downtrend downtrend uptrend
    // uptrend downtrend uptrend > uptrend downtrend sideways || uptrend downtrend downtrend

    // uptrend uptrend downtrend downtrend
    // downtrend downtrend downtrend downtrend

    // const downtrend = las6hrsTrend.trend == "downtrend" && las6hrsTrend.strength == "strong";
    // const half = parseInt(this.trends.length / 2);
    // const down = this.trends.slice(0, -1).every((t) => t == "downtrend");
    const increasing = calcPct(prices.at(-parseInt(60 / this.interval)), prices.at(-1));
    // const up = increasing >= 1;
    // const up = this.trends.every((t) => t == "uptrend");

    // let shouldBuy = this.trends.length >= this.lookBack - 1 && down && up;
    // this.dispatch("LOG", `${las6hrsTrend.trend}-${las6hrsTrend.strength} - ${increasing}`);
    // this.dispatch("LOG", this.trends.join("-"));
    // console.log(down && up, this.trends.length >= this.lookBack);
    // const downtrends = this.trends.filter((t) => t == "downtrend").length;
    // const uptrends = this.trends.filter((t) => t == "uptrend").length;
    // let shouldBuy = trend.trend == "uptrend" && trend.strength == "strong";
    // let shouldBuy = trend != "downtrend" && nearLowChange >= 1 && nearLowChange < 2 && increasing >= 1;

    let shouldBuy = allTrends == "uptrend-uptrend-downtrend-downtrend";
    let sell = allTrends == "downtrend-downtrend-downtrend-downtrend";
    sell = sell || allTrends == "uptrend-uptrend-uptrend-downtrend";
    // Buy
    console.log(allTrends, priceChange, this.priceBaselineChange);

    if (!position && this.capital > 0 && balance.eur >= 5) {
      // console.log(
      //   this.trends.filter((t) => t == "uptrend").length < this.trends.filter((t) => t == "downtrend").length,
      //   this.trends.slice(0, -1).every((t) => t == "uptrend")
      // );

      if (shouldBuy && safeAskBidSpread && this.lastTradeTimer <= 0) {
        await this.buy(balance, currentPrice.askPrice);
        this.prevGainPercent = 0;
        this.priceBaselineChange = 0;
        this.dispatch("LOG", `Placed BUY at: ${currentPrice.askPrice}`);
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

      // const shouldSell = gainLossPercent >= 1 && loss > 1;
      // const downtrend = this.trends.every((t) => t == "downtrend");
      // const result = shouldSell || gainLossPercent <= -2 || loss >= 2 || downtrend;
      const shouldSell = (gainLossPercent >= 3 && loss > 1) || gainLossPercent <= -2 || loss >= 3;
      if (sell && safeAskBidSpread) {
        // this.dispatch("LOG", this.trends.join("-"));
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        this.lastTradeTimer = (res.age * 60) / this.interval;
        this.priceBaselineChange = 0;
        this.dispatch("LOG", `Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    if (
      (priceChange < -30 && priceChange < this.priceBaselineChange) ||
      (priceChange > 10 && priceChange > this.priceBaselineChange)
    ) {
      this.priceBaselineChange = priceChange;
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
