const Trader = require("./trader.js");

const {
  calcPercentageDifference,
  calculateFee,
  calcAveragePrice,
  normalizePrices,
  removeLowsOrHighs,
} = require("../services.js");
const { findPriceMovement, linearRegression, analyzeTrend } = require("../indicators.js");
const calcPercentage = calcPercentageDifference;

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.range = (24 * 60) / this.interval;
    this.percentThreshold = 5;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    // this.trends = "0-x-x-x-x";
    this.trends = [];
    // this.highestPrice = 0;
    this.lowestPrice = 0;
    this.lastTradeTimer = 0;
    this.lastTradePrice = 0;
    this.breakdown = false;
    this.shouldSell = false;
    // this.percentThreshold = null;
    this.increasingSince = 0;
  }

  async run() {
    // Get data from Kraken
    const prices = await this.ex.prices(this.pair, this.range); // Change this to 12 hrs if 24 is not used
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = (await this.ex.getOrders(this.pair))[0];
    // const trades = await this.ex.getState(this.pair, "trades");
    const currentPrice = prices.at(-1);

    if (prices.length < this.range) return;

    const askBidSpreadPercentage = calcPercentage(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(prices.map((p) => calcPercentage(p.bidPrice, p.askPrice)));
    const safeAskBidSpread = askBidSpreadPercentage <= Math.min(averageAskBidSpread * 2, 1); // safeAskBidSpread
    const normalizedPrices = normalizePrices(prices, averageAskBidSpread);

    if (!position) {
      const sorted = normalizedPrices.toSorted((a, b) => a - b);
      this.percentThreshold = Math.max(calcPercentage(sorted[0], sorted.at(-1)) / 1.3, 5);
    }

    this.updateTrends(linearRegression(removeLowsOrHighs(normalizedPrices), true, 0));

    // const trendsFlow = this.trends.slice(1).join("-") || "";
    // let [_, signal] = conditions.find((c) => trendsFlow.includes(c[0])) || ["", "NO-SIGNAL"];
    let shouldBuy = this.findPriceMovement(
      normalizedPrices,
      this.percentThreshold / 4,
      this.percentThreshold
    );

    console.log(this.percentThreshold);

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    // Buy
    if (!position && this.capital > 0 && balance.eur >= 5) {
      if (shouldBuy && safeAskBidSpread && this.lastTradeTimer <= 0) {
        this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.3);
        const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("BUY", orderId);
        this.shouldSell = false;
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
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: -${this.losses[0]}% - Recovered: ${this.losses[1]}%`
      );

      // if (signal == "SELL") this.shouldSell = true;

      const case1 =
        this.prevGainPercent >= Math.max(this.percentThreshold / 3, 2) &&
        loss > Math.max(this.prevGainPercent / 5, 0.7);

      const remain = this.losses[0] - this.losses[1];
      const case2 =
        this.losses[0] >= Math.min(this.percentThreshold / 2, 5) &&
        remain > 0 &&
        this.losses[1] - -gainLossPercent > remain;

      const case3 = loss > 10;

      if ((case1 || case2 || case3) && safeAskBidSpread) {
        this.dispatch("LOG", `Placing SELL order ${currentPrice.bidPrice} - ${case1} ${case2} ${case3}`);
        await this.sell(position, balance.crypto, currentPrice.bidPrice);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        // this.lastTradeTimer = (Date.now() - position.createdAt) / 60000 / this.interval;
        this.lastTradeTimer = (12 * 60) / this.interval;
        if (gainLossPercent >= this.percentThreshold) this.lastTradePrice = normalizedPrices.at(-1);
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    }

    if (this.lastTradeTimer > 0) this.lastTradeTimer--;
    else this.lastTradeTimer = 0;
    this.dispatch("LOG", "");
  }

  updateTrends(trend) {
    // if (this.trends.at(-1) != trend) this.trends.push(trend);
    // if (this.trends.length > 4) this.trends.shift();

    if (!this.trends[0] || this.trends[0] > 60 / this.interval) {
      this.trends[0] = 0;
      this.trends.push(trend);
      if (this.trends.length > 7) {
        this.trends.shift();
        this.trends[0] = 0;
      }
    }
    this.trends[0]++;

    // let arr = this.trends.split("-");
    // let timer = +arr.at(0);
    // if (timer > this.range || this.trends == "0-x-x-x-x") {
    //   arr.push(trend);
    //   timer = 0;
    // }
    // if (arr.length > 7) arr = arr.slice(2);
    // else arr.shift();
    // this.trends = timer + 1 + ("-" + arr.join("-"));
  }

  findPriceMovement(prices, minIncreasePrc, dropRisePercent) {
    const length = prices.length - 1;
    let price = prices.at(-1);
    let case1 = false;
    let case2 = false;
    let case3 = false;

    for (let i = length; i > -1; i--) {
      const changePercent = calcPercentageDifference(prices[i], price);
      if (!case1 && changePercent >= minIncreasePrc) {
        case1 = true;
        price = prices[i];
      }
      if (!case2 && dropRisePercent <= -changePercent) {
        case2 = true;
        price = prices[i];
      }
      if (!case3 && changePercent >= dropRisePercent) {
        case3 = true;
        price = prices[i];
      }

      if (case1 && case2 && case3) return true;
    }

    return false;
  }
}

module.exports = MyTrader;

const conditions = [
  // ["DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-UPTREND", "BREAKDOWN-BUY"],
  // ["DOWNTREND-UPTREND-DOWNTREND-UPTREND-DOWNTREND-DOWNTREND", "SELL"],

  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND", "BUY"],
  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND", "SELL"],
  ["-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND", "SELL"],
  ["UPTREND-UPTREND-UPTREND-UPTREND-UPTREND-DOWNTREND", "SELL"],

  // ["DOWNTREND-DOWNTREND-DOWNTREND-UPTREND", "BUY"],
  // ["DOWNTREND-DOWNTREND-UPTREND-DOWNTREND", "SELL"],

  // ["DOWNTREND-DOWNTREND-DOWNTREND-SIDEWAYS", "BUY"],
  // ["DOWNTREND-DOWNTREND-SIDEWAYS-DOWNTREND", "SELL"],

  // ["DOWNTREND-UPTREND-DOWNTREND-UPTREND", "BUY"],
  // ["DOWNTREND-SIDEWAYS-DOWNTREND-UPTREND", "BUY"],
  // ["DOWNTREND-SIDEWAYS-SIDEWAYS-UPTREND", "BUY"],

  // ["UPTREND-UPTREND-SIDEWAYS-DOWNTREND", "SELL"],
  // ["UPTREND-UPTREND-UPTREND-DOWNTREND", "SELL"],
  // ["UPTREND-SIDEWAYS-SIDEWAYS-DOWNTREND", "SELL"],
  // ["SIDEWAYS-SIDEWAYS-SIDEWAYS-DOWNTREND", "SELL"],
  // ["UPTREND-UPTREND-UPTREND-SIDEWAYS", "SELL"],

  // ["SIDEWAYS-SIDEWAYS-SIDEWAYS-DOWNTREND", "SELL"],
  // ["SIDEWAYS-SIDEWAYS-SIDEWAYS-DOWNTREND", "SELL"],
  // ["UPTREND-UPTREND-UPTREND-DOWNTREND", "SELL"],

  // ["DOWNTREND-DOWNTREND-DOWNTREND-SIDEWAYS-SIDEWAYS-SIDEWAYS", "DROP-SELL"],
];

/**
+: 
-: 
+: DOWNTREND-UPTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND
-: UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND
+: DOWNTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND
-: DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND-UPTREND
+: DOWNTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND
-: DOWNTREND-UPTREND-DOWNTREND-UPTREND-UPTREND-UPTREND
+: SIDEWAYS-UPTREND-DOWNTREND-UPTREND-UPTREND-DOWNTREND
-: UPTREND-DOWNTREND-UPTREND-UPTREND-SIDEWAYS-UPTREND || UPTREND-DOWNTREND-UPTREND-UPTREND-UPTREND-UPTREND
+: UPTREND-UPTREND-SIDEWAYS-UPTREND-DOWNTREND-DOWNTREND
-: UPTREND-SIDEWAYS-UPTREND-DOWNTREND-DOWNTREND-UPTREND
+: SIDEWAYS-UPTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND
-: UPTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-UPTREND
+: DOWNTREND-UPTREND-DOWNTREND-UPTREND-DOWNTREND-DOWNTREND
-: UPTREND-UPTREND-UPTREND-DOWNTREND-UPTREND-UPTREND
+: DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND
-: UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND


 */
