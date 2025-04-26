const Trader = require("./trader.js");

const {
  calcPercentageDifference,
  calculateFee,
  calcAveragePrice,
  normalizePrices,
  removeLowsOrHighs,
  smoothPrices,
} = require("../services.js");
const { linearRegression, analyzeTrend } = require("../indicators.js");
const { isOlderThan } = require("../utilities.js");
const calcPercentage = calcPercentageDifference;

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital, mode);
    this.range = (6 * 60) / this.interval;
    this.percentThreshold = 4;
    this.profitTarget = 4;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    // this.trends = "0-x-x-x-x";
    this.trends = [];
    this.highestPrice = null;
    this.lowestPrice = null;
    this.lastTradeTimer = 0;
    this.lastTradePrice = 0;
    this.breakdown = false;
    this.shouldSell = false;
    this.droppedPercent = 0;
  }

  async run() {
    // Get data from Kraken
    const prices = await this.ex.prices(this.pair, this.range); // Change this to 12 hrs if 24 is not used
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    // const trades = await this.ex.getState(this.pair, "trades");
    const currentPrice = prices.at(-1);

    if (prices.length < this.range) return;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    const askBidSpreadPercentage = calcPercentage(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(prices.map((p) => calcPercentage(p.bidPrice, p.askPrice)));
    const safeAskBidSpread = askBidSpreadPercentage <= Math.min(averageAskBidSpread * 2, 1); // safeAskBidSpread
    const normalizedPrices = normalizePrices(prices, averageAskBidSpread);

    const sortedBidPrices = normalizedPrices.toSorted((a, b) => a - b);
    const priceChangePercent = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    if (priceChangePercent > this.percentThreshold) this.percentThreshold = priceChangePercent;

    let cleanedPrices = removeLowsOrHighs(removeLowsOrHighs(normalizedPrices, 12, 1.5, 3), 18, -1.5, 4);
    cleanedPrices = smoothPrices(removeLowsOrHighs(cleanedPrices, 18, 1.5, 3));
    this.updateTrends(linearRegression(cleanedPrices, true, 0));

    // const trendsFlow = this.trends.slice(1).join("-") || "";
    // let [_, signal] = conditions.find((c) => trendsFlow.includes(c[0])) || ["", "NO-SIGNAL"];

    const trends = this.trends.slice(0, -1);
    const downtrend = trends.every((t) => t == "downtrend");
    let shouldBuy = downtrend && this.trends.at(-1) == "uptrend";

    if (this.lastTradePrice > 0) {
      const percent = calcPercentage(this.lastTradePrice, cleanedPrices.at(-1));
      if (percent > this.droppedPercent) {
        this.percentThreshold += percent - this.droppedPercent;
        this.droppedPercent = Math.max(percent, 0);
      } else if (this.droppedPercent - percent > 1.5) {
        shouldBuy = true;
      }

      // this.profitTarget = this.percentThreshold + this.droppedPercent;
      console.log("=====> Increased", this.droppedPercent, percent, this.droppedPercent - percent, "-");
    }

    this.profitTarget = Math.min(Math.max(this.percentThreshold / 3, 4), 10);
    console.log(this.profitTarget, this.percentThreshold, this.droppedPercent);

    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      if (shouldBuy && safeAskBidSpread && this.lastTradeTimer <= 0) {
        this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.3);
        const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("BUY", orderId);
        this.lastTradePrice = 0;
        this.droppedPercent = 0;
        this.prevGainPercent = 0;
      }

      // Sell
    } else if (position && balance.crypto > 0) {
      const gainLossPercent = calcPercentage(position.price, cleanedPrices.at(-1));
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
      // const stopLoss = gainLossPercent < -10 || (isOlderThan(position.createdAt, 12) && gainLossPercent < -5);
      const stopLoss = gainLossPercent < -2;

      // (this.prevGainPercent > 3 && loss > Math.max(gainLossPercent / 4, 1)) ||
      // this.prevGainPercent <= 3 && loss > 3;

      // console.log(shouldSell, "stopLoss: ", stopLoss);
      if ((shouldSell || stopLoss) && safeAskBidSpread) {
        this.dispatch("LOG", `Placing SELL order ${currentPrice.bidPrice}`);
        await this.sell(position, balance.crypto, currentPrice.bidPrice);

        if (stopLoss) this.lastTradePrice = cleanedPrices.at(-1);
        else if (gainLossPercent >= this.profitTarget / 1.3) {
          this.percentThreshold = 4;
          this.profitTarget = 4;
        }
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    this.dispatch("LOG", "");
  }

  updateTrends(trend) {
    // if (this.trends.at(-1) != trend)
    this.trends.push(trend);
    if (this.trends.length > 12 * 6) this.trends.shift(); // 12 = 1hrs

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

module.exports = MyTrader;

const conditions = [
  ["downtrend-downtrend-downtrend-downtrend-downtrend-uptrend", "buy"],
  ["uptrend-uptrend-uptrend-uptrend-uptrend-downtrend", "buy"],
  // ["uptrend-uptrend-uptrend-downtrend-downtrend-uptrend", "buy"],
];

/**


 */
