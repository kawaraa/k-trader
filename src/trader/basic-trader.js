const Trader = require("./trader.js");

const { calcPercentageDifference, calcAveragePrice, normalizePrices } = require("../services.js");
// const { linearRegression } = require("../indicators.js");
const calcPercentage = calcPercentageDifference;
const lookback = 12 * 12;

// Smart trader
class BasicTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.range = (6 * 60) / this.interval;
    this.percentThreshold = 4;
    this.profitTarget = 4;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    // this.trends = "0-x-x-x-x";
    this.trends = [];
    this.highestPrice = 0;
    this.lowestPrice = 0;
    this.lowestPriceTimestamp = 0;
    this.lastTradeTimer = 0;
    this.lastTradePrice = 0;
    this.breakdown = false;
    this.shouldSell = false;
    this.droppedPercent = 0;
  }

  async run() {
    // Get data from Kraken
    const last24HrsPrices = await this.ex.prices(this.pair, this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    // const { trades } = await this.ex.state.getBot(this.pair);
    const currentPrice = last24HrsPrices.at(-1);

    if (last24HrsPrices.length < this.range) return;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    const askBidSpreadPercentage = calcPercentage(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(
      last24HrsPrices.map((p) => calcPercentage(p.bidPrice, p.askPrice))
    );
    const safeAskBidSpread = askBidSpreadPercentage <= Math.min(averageAskBidSpread * 2, 1); // safeAskBidSpread
    const normalizedPrices = normalizePrices(last24HrsPrices, averageAskBidSpread);
    const prices = normalizedPrices.slice(-parseInt(this.range));
    const averagePrice = calcAveragePrice(normalizedPrices);

    const sortedBidPrices = normalizedPrices.toSorted((a, b) => a - b);
    const priceChangePercent = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    if (priceChangePercent > this.percentThreshold) this.percentThreshold = priceChangePercent;

    // const last24HrsUptrend = linearRegression(last24HrsPrices, true, 0.002) == "uptrend";
    // this.updateTrends(linearRegression(prices, true, 0));

    this.updateTrends(linearRegression(prices));

    const droppedPercent = calcPercentage(normalizedPrices.at(-1), this.lowestPrice);
    if (this.lowestPriceTimestamp > (12 * 60) / 5 || droppedPercent >= 10) {
      this.lowestPrice = normalizedPrices.at(-1);
      this.lowestPriceTimestamp = 0;
    }

    const trends = this.trends.slice(0, -1);
    const downtrend = trends.every((t) => t == "downtrend");
    let shouldBuy = this.trends.length >= lookback - 1 && downtrend && this.trends.at(-1) == "uptrend";
    if (!shouldBuy) {
      // shouldBuy =
      //   trends.filter((t) => t == "downtrend").length / 2 <= trends.filter((t) => t == "uptrend").length;
      // shouldBuy =
      //   trends.slice(0, parseInt(trends.length)).every((t) => t == "downtrend") &&
      //   trends.slice(-parseInt(trends.length)).every((t) => t == "uptrend");
    }
    // shouldBuy = shouldBuy && normalizedPrices.at(-1) < averagePrice * 1.2;

    if (this.lastTradePrice > 0) {
      const percent = calcPercentage(this.lastTradePrice, normalizedPrices.at(-1));
      if (percent < this.droppedPercent) {
        this.percentThreshold += Math.abs(percent - this.droppedPercent);
        this.droppedPercent = percent;
      } else if (
        Math.abs(this.droppedPercent - percent) > Math.max(Math.min(this.percentThreshold / 4, 4), 2)
      ) {
        shouldBuy = true;
      } else {
        shouldBuy = false;
      }

      // console.log("===>", this.droppedPercent, percent, Math.abs(this.droppedPercent - percent));
    }

    this.profitTarget = Math.min(Math.max(this.percentThreshold / 3, 4), 10);
    // console.log(
    //   "===>",
    //   this.lowestPrice,
    //   this.lowestPriceTimestamp,
    //   this.trends.at(-1),
    //   this.profitTarget,
    //   this.percentThreshold,
    //   this.droppedPercent
    // );

    shouldBuy = shouldBuy && normalizedPrices.at(-1) > this.lowestPrice;

    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      if (shouldBuy && safeAskBidSpread && this.lastTradeTimer <= 0) {
        await this.buy(balance, currentPrice.askPrice);
        this.dispatch("LOG", `Placed BUY at: ${currentPrice.askPrice}`);
        this.lastTradePrice = 0;
        this.lowestPrice = normalizedPrices.at(-1);
        this.lowestPriceTimestamp = 0;
        this.droppedPercent = 0;
        this.prevGainPercent = 0;
      }

      // Sell
    } else if (position && balance.crypto > 0) {
      const gainLossPercent = calcPercentage(position.price, normalizedPrices.at(-1));
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);
      // const prevDropAgain = this.losses[2];

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

      // const trends = this.trends.slice(parseInt(this.trends.length / 2), -1); // parseInt(this.trends.length / 3)
      // const uptrend = trends.every((t) => t == "uptrend") && this.trends.at(-1) == "downtrend";

      const shouldSell =
        this.prevGainPercent >= this.profitTarget && loss > Math.max(this.prevGainPercent / 5, 1);
      const stopLoss = gainLossPercent < -3 && normalizedPrices.at(-1) < this.lowestPrice;

      // console.log("shouldSell: ", shouldSell, "stopLoss: ", stopLoss);
      if ((shouldSell || stopLoss) && safeAskBidSpread) {
        const res = await this.sell(position, balance, currentPrice.bidPrice);
        this.dispatch("LOG", `Placed SELL - profit/loss: ${res.profit} - Held for: ${res.age}hrs`);

        if (stopLoss) {
          this.lastTradePrice = normalizedPrices.at(-1);
          this.lowestPrice = normalizedPrices.at(-1);
          this.lowestPriceTimestamp = 0;
        } else if (gainLossPercent >= this.profitTarget / 1.3) {
          this.percentThreshold = 4;
          this.profitTarget = 4;
        }
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    this.lowestPriceTimestamp++;
    this.dispatch("LOG", "");
  }

  updateTrends(result) {
    // console.log(result);
    if (result.trend == "uptrend" && ["week"].includes(result.strength)) return;
    // if (this.trends.at(-1) != trend)
    this.trends.push(result.trend);
    if (this.trends.length > lookback) this.trends.shift(); // 12 = 1hrs

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

const conditions = [
  ["downtrend-downtrend-downtrend-downtrend-downtrend-uptrend", "buy"],
  ["uptrend-uptrend-uptrend-uptrend-uptrend-downtrend", "buy"],
  // ["uptrend-uptrend-uptrend-downtrend-downtrend-uptrend", "buy"],
];

/**


 */

function linearRegression(data) {
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
    trend: slope > 0 ? "uptrend" : slope < 0 ? "downtrend" : "sideways",
    slope: formatDecimal(slope),
    intercept: formatDecimal(intercept),
    r2: formatDecimal(r2),
    strength: r2 > 0.7 ? "strong" : r2 > 0.4 ? "moderate" : "weak",
  };
}
