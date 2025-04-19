const Trader = require("./trader.js");

const { calcPercentageDifference, calculateFee, calcAveragePrice } = require("../services.js");
const { findPriceMovement, linearRegression } = require("../indicators.js");
const calcPercentage = calcPercentageDifference;

function detectTrendBasedCloses(prices) {
  const slope = linearRegression(prices);
  if (slope > 0) return "UPTREND";
  if (slope < 0) return "DOWNTREND";
  return "SIDEWAYS";
}

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.range = (3 * 60) / this.interval;
    this.priceChangePercent = 4;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    // this.trends = "0-x-x-x-x";
    this.trends = [];
    this.highestPrice = null;
    this.lowestPrice = null;
    this.lastTradeTimer = 0;
    this.lastTradePrice = 0;
    this.breakdown = false;
  }

  async run() {
    // Get data from Kraken
    const prices = await this.ex.prices(this.pair, this.range); // Change this to 12 hrs if 24 is not used
    const bidPrices = prices.map((p) => p.bidPrice);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = await this.ex.getOrders(this.pair);
    const trades = await this.ex.getState(this.pair, "trades");
    const currentPrice = prices.at(-1);
    let shouldBuy = false;
    let shouldSell = false;

    if (prices.length < this.range) return;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    // const strategyExpired =
    //   !this.strategyTest.timestamp ||
    //   this.strategyTest.timestamp / 60 > 12 ||
    //   (trades.at(-1) < 0 && this.strategyTest.timestamp / 60 > 3);
    // if (!(trades.at(-1) > 0)) test.percentThreshold = test.percentThreshold * 1.2;
    // test.loss == 0 &&

    const askBidSpreadPercentage = calcPercentage(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(prices.map((p) => calcPercentage(p.bidPrice, p.askPrice)));
    const safeAskBidSpread = askBidSpreadPercentage <= Math.min(averageAskBidSpread * 2, 1); // safeAskBidSpread

    const sortedBidPrices = bidPrices.toSorted((a, b) => a - b);
    const pricePercentThreshold = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    this.priceChangePercent = pricePercentThreshold;

    this.updateTrends(detectTrendBasedCloses(bidPrices));

    const movement = findPriceMovement(
      bidPrices,
      Math.max(this.priceChangePercent / 1.3)
      // Math.max(this.priceChangePercent / 4, 1),
      // Math.max(this.priceChangePercent / 1.3, 2)
      //  Math.min(Math.max(this.priceChangePercent / 2, 2), 4)
    );
    const increasing = movement.includes("INCREASING");
    const dropping = movement.includes("DROPPING");

    const trendsFlow = this.trends.slice(1).join("-") || "";
    if (trendsFlow.includes(conditions[0][0]) || trendsFlow.includes(conditions[2][0])) this.breakdown = true;

    let [_, signal] = conditions.find((c) => trendsFlow.includes(c[0])) || ["", "NO-SIGNAL"];

    shouldBuy = signal == "BUY" || (this.breakdown && signal == "BREAKDOWN-BUY");

    console.log("===> ", signal, trendsFlow, movement, this.breakdown, this.priceChangePercent);

    // let shouldBuy = this.trends[0] == "UPTREND" && this.trends.at(-1) == "DOWNTREND" && increasing;
    // if (!shouldBuy) shouldBuy = this.trends.includes("UPTREND-DOWNTREND-DOWNTREND-UPTREND") && increasing;
    // if (!shouldBuy) shouldBuy = this.trends.includes("UPTREND-UPTREND-DOWNTREND-UPTREND") && increasing;
    // if (!shouldBuy) {
    //   shouldBuy = this.trends.includes("DOWNTREND-UPTREND-UPTREND-DOWNTREND") && increasing;
    // }

    // const buyOnUptrend =
    //   (this.trends.includes("DOWNTREND-DOWNTREND-UPTREND-UPTREND") ||
    //     this.trends.includes("UPTREND-DOWNTREND-UPTREND-UPTREND") ||
    //     this.trends.includes("DOWNTREND-UPTREND-UPTREND-UPTREND")) &&
    //   findPriceMovement(
    //     bidPrices,
    //     Math.max(this.priceChangePercent / 5, 1),
    //     Math.max(this.priceChangePercent / 2, 2)
    //   ).includes("INCREASING") &&
    //   trades.at(-1) > 0;

    if (!positions[0] && this.capital > 0 && balance.eur >= 5) {
      // Buy
      // const pause = trades.at(-1) > 3 && this.lastTradeTimer < this.range;

      if (shouldBuy && safeAskBidSpread && this.lastTradeTimer >= this.range) {
        this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.3);
        const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("BUY", orderId);
        this.lastTradeTimer = 0;
        this.lastTradePrice = currentPrice.askPrice;
        //
      }
    } else if (positions[0] && balance.crypto > 0) {
      // Sell

      const gainLossPercent = calcPercentage(positions[0].price, currentPrice.bidPrice);
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);

      const prevDropAgain = this.losses[2];
      if (this.prevGainPercent < 3) {
        if (loss >= this.losses[0]) this.losses[0] = loss;
        else if (this.losses[0]) {
          const recoveredPercent = +(this.losses[0] - loss).toFixed(2);
          if (recoveredPercent > 0.5 && recoveredPercent > this.losses[1]) this.losses[1] = recoveredPercent;
        }
      }

      if (this.losses[1]) {
        this.losses[2] = +(loss - (this.losses[0] - this.losses[1])).toFixed(2); // drops after it's recovered
      }

      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      // const profitable =
      //   gainLossPercent > Math.max(this.priceChangePercent / 2, 4) && loss > this.priceChangePercent / 4;
      // const stopLoss =
      //   gainLossPercent < -5 ||
      //   (this.losses[0] > Math.max(this.priceChangePercent / 3, 4) &&
      //     this.losses[1] > Math.max(this.losses[0] / 2, 2) &&
      //     this.losses[2] > Math.max(this.losses[1] / 2, 1));

      // const movement = findPriceMovement(
      //   bidPrices,
      //   Math.max(this.priceChangePercent / 5, 1),
      //   Math.max(this.priceChangePercent / 2, 2)
      // );

      const dropping = prevDropAgain > this.losses[2];

      // const exception = trendsFlow.includes("UPTREND-UPTREND-DOWNTREND-UPTREND-UPTREND-UPTREND");
      // const stopLoss =
      //   signal == "HOLD" && gainLossPercent <= 1 && loss > Math.max(this.prevGainPercent / 5, 3);
      // const shouldSell = (signal == "SELL" || exception) && loss > Math.max(this.prevGainPercent / 5, 1);
      let shouldSell = signal == "SELL" && loss > Math.max(gainLossPercent / 5, 1.5);
      if (!shouldSell) shouldSell = !signal.includes("BUY") && loss > Math.max(gainLossPercent / 5, 4);
      if (!shouldSell && gainLossPercent > 1) {
        shouldSell = findPriceMovement(bidPrices.slice(-parseInt(60 / this.interval)), 1, 4).includes(
          "DROPPING"
        );
      }

      // (this.prevGainPercent >= 15 && loss > 2)

      // const aboveZero = (gainLossPercent > 0 && gainLossPercent > this.priceChangePercent / 2) || true;
      // const case2 = this.trends.includes("DOWNTREND-DOWNTREND-UPTREND") && dropping;

      if (shouldSell && safeAskBidSpread) {
        this.dispatch("LOG", `Placing SELL order ${currentPrice.bidPrice}`);
        await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        this.lastTradeTimer = 0;
        this.lastTradePrice = currentPrice.askPrice;
        if (gainLossPercent > 4) this.breakdown = false;
        // this.trends = "x-x-x";
        //
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    }

    this.lastTradeTimer++;
    this.dispatch("LOG", "");
  }

  updateTrends(trend) {
    // const arr = this.trends.split("-");
    // if (this.trends.at(-1) != trend) this.trends.push(trend);
    // if (this.trends.length > 2) this.trends.shift();
    // this.trends = arr.join("-")

    if (!this.trends[0] || this.trends[0] > this.range) {
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
}

module.exports = MyTrader;

const conditions = [
  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND", "HOLD"],
  ["UPTREND-UPTREND-UPTREND-UPTREND-UPTREND-UPTREND", "HOLD"],

  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND", "BUY"],
  // ["UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND", "BUY"], // To remove
  ["DOWNTREND-DOWNTREND-UPTREND-UPTREND-DOWNTREND-DOWNTREND", "BUY"],
  ["DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-DOWNTREND-UPTREND", "BUY"],
  ["UPTREND-DOWNTREND-UPTREND-UPTREND-DOWNTREND-UPTREND", "BUY"],

  ["UPTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND", "BUY"],
  ["DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-UPTREND", "BREAKDOWN-BUY"],
  ["UPTREND-UPTREND-DOWNTREND-UPTREND-UPTREND-DOWNTREND", "BREAKDOWN-BUY"],
  // ["DOWNTREND-UPTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND", "BREAKDOWN-BUY"],

  ["UPTREND-UPTREND-UPTREND-UPTREND-UPTREND-DOWNTREND", "SELL"],
  ["UPTREND-UPTREND-UPTREND-UPTREND-DOWNTREND-DOWNTREND", "SELL"],
  ["UPTREND-UPTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND", "SELL"],
  ["UPTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND", "SELL"],
  ["DOWNTREND-DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND", "SELL"],
  ["DOWNTREND-UPTREND-UPTREND-UPTREND-UPTREND-DOWNTREND", "SELL"],
  ["DOWNTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND-DOWNTREND", "SELL"],
  ["UPTREND-UPTREND-DOWNTREND-DOWNTREND-UPTREND-UPTREND", "SELL"],
  ["UPTREND-UPTREND-DOWNTREND-DOWNTREND-UPTREND-DOWNTREND", "SELL"],
  ["DOWNTREND-UPTREND-UPTREND-DOWNTREND-DOWNTREND-DOWNTREND", "SELL"],

  ["DOWNTREND-DOWNTREND-UPTREND-DOWNTREND-UPTREND-DOWNTREND", "SELL"],
  ["UPTREND-DOWNTREND-UPTREND-DOWNTREND-UPTREND-UPTREND", "SELL"],
  ["UPTREND-UPTREND-DOWNTREND-UPTREND-DOWNTREND-DOWNTREND", "SELL"],
];

/**

"tradePrice": 0.2559, "askPrice": 0.2542, "bidPrice": 0.2535

 */
