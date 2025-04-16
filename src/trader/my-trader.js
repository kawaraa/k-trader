const Trader = require("./trader.js");

const { calcPercentageDifference, calculateFee, calcAveragePrice } = require("../services.js");
const { findPriceMovement, linearRegression, analyzeTrend } = require("../indicators.js");
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
    this.range = (24 * 60) / this.interval;
    // this.analysisPeriod = 1 * 24 * 60 + this.range * 5;
    this.priceChangePercent = 4;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.prev12HrsTrend = null;
    this.prev6HrsTrend = null;
    this.lastTradeAge = 0;
    this.lastOrderAskPrice = 0;
    this.lastOrderBidPrice = 0;
  }

  async run() {
    // const period = this.analysisPeriod / this.interval;

    // Get data from Kraken
    const last24HrsPrices = await this.ex.prices(this.pair, this.range);
    const last12HrsPrices = last24HrsPrices.slice(-parseInt(this.range / 2));
    const last6HrsPrices = last24HrsPrices.slice(-parseInt(this.range / 4));
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = await this.ex.getOrders(this.pair);
    const trades = await this.ex.getState(this.pair, "trades");
    const currentPrice = last24HrsPrices.at(-1);

    if (last24HrsPrices.length < this.range) return;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);
    // console.log("priceChangePercent", this.priceChangePercent);

    // const strategyExpired =
    //   !this.strategyTest.timestamp ||
    //   this.strategyTest.timestamp / 60 > 12 ||
    //   (trades.at(-1) < 0 && this.strategyTest.timestamp / 60 > 3);
    // if (!(trades.at(-1) > 0)) test.percentThreshold = test.percentThreshold * 1.2;
    // test.loss == 0 &&

    const askBidSpreadPercentage = calcPercentage(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(
      last6HrsPrices.map((p) => calcPercentage(p.bidPrice, p.askPrice))
    );
    const safeAskBidSpread = askBidSpreadPercentage <= averageAskBidSpread * 1.1; // safeAskBidSpread

    const last6HrsPricesBidPrices = last6HrsPrices.map((p) => p.bidPrice);
    const sortedBidPrices = last6HrsPricesBidPrices.toSorted((a, b) => a - b);
    const pricePercentThreshold = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    if (!positions[0] && pricePercentThreshold >= 4) this.priceChangePercent = pricePercentThreshold;
    const analyzedPrices = analyzeTrend(last6HrsPricesBidPrices);
    // const pricePercentThreshold = analyzedPrices.dropped / analyzedPrices.highs.length;
    // if (!positions[0] && pricePercentThreshold > 3) this.priceChangePercent = pricePercentThreshold * 1.3;

    const pauseCase1 = this.lastTradeAge < (3 * 60) / 5;
    const pauseCase2 = calcPercentage(this.lastOrderBidPrice, currentPrice.askPrice) > 1;
    const shouldPause =
      trades.at(-1) > Math.max(this.priceChangePercent / 2, 3) && (pauseCase1 || pauseCase2);

    const last24HrsTrend = detectTrendBasedCloses(last24HrsPrices.map((p) => p.bidPrice));
    const last12HrsTrend = detectTrendBasedCloses(last12HrsPrices.map((p) => p.bidPrice));
    const last6HrsTrend = detectTrendBasedCloses(last6HrsPricesBidPrices);
    if (last12HrsTrend == "UPTREND") this.prev12HrsTrend = last12HrsTrend;
    if (last6HrsTrend == "UPTREND") this.prev6HrsTrend = last6HrsTrend;

    if (!positions[0] && this.capital > 0 && balance.eur >= 5) {
      // Buy
      let shouldBuy = false;
      const buyOnPercent = Math.max(this.priceChangePercent / 4, 0.7);
      // const reducingTrend = analyzedPrices.lows.filter((h) => -h >= 1 && -h < 3).length > 1;

      const movement = findPriceMovement(
        last6HrsPricesBidPrices,
        buyOnPercent,
        this.priceChangePercent / 1.1
      );

      // console.log("percentage:", this.priceChangePercent, buyOnPercent);
      if (
        pricePercentThreshold >= 4 &&
        last24HrsTrend != "DOWNTREND" &&
        this.prev6HrsTrend == "UPTREND" &&
        last6HrsTrend == "DOWNTREND" &&
        movement.includes("INCREASING")
      ) {
        shouldBuy = true;
        console.log("ShouldBuy based on 6 hrs");
        // console.log("trends:", last24HrsTrend, this.prev12HrsTrend, last12HrsTrend);
        // console.log("movement:", reducingTrend, analyzedPrices.trend, last6HrsTrend, movement);
      } else if (last12HrsTrend == "UPTREND" && movement.includes("INCREASING")) {
        shouldBuy = true;
        console.log("ShouldBuy based on 24 hrs");
      } else if (last24HrsTrend != "UPTREND" && last12HrsTrend != "DOWNTREND") {
        const movement = findPriceMovement(
          last6HrsPricesBidPrices,
          buyOnPercent,
          this.priceChangePercent / 2
        );
        if (movement.includes("INCREASING")) shouldBuy = true;

        console.log("ShouldBuy based on 24 hrs UPTREND");
      }

      if (this.prev12HrsTrend == "UPTREND" && last12HrsTrend == "DOWNTREND") {
        // const analyzedPrices = analyzeTrend(last6HrsPricesBidPrices);
        // const buyOnPercent = Math.max(this.priceChangePercent / 5, 0.5);
        // const movement = findPriceMovement(
        //   last6HrsPricesBidPrices,
        //   Math.max(this.priceChangePercent / 5, 0.5),
        //   Math.max(this.priceChangePercent / 2, 1)
        // );
        // console.log(movement, analyzedPrices);
        // if (movement.includes("INCREASING") && !analyzedPrices.highs.find((h) => h >= buyOnPercent)) {
        //   shouldBuy = true;
        //   this.prev12HrsTrend = null;
        // }
      } else if (
        last24HrsTrend == "DOWNTREND" &&
        this.prev12HrsTrend == "UPTREND" &&
        last12HrsTrend == "UPTREND"
      ) {
        // const movement = findPriceMovement(
        //   last6HrsPricesBidPrices,
        //   Math.max(this.priceChangePercent / 4, 0.5),
        //   this.priceChangePercent / 2
        // );
        // console.log("movement: ====> ", pauseCase1, pauseCase2, shouldPause, movement);
        // if (!pauseCase2 && movement.includes("INCREASING")) {
        //   shouldBuy = true;
        //   this.prev12HrsTrend = null;
        // }
      }

      if (shouldBuy && safeAskBidSpread && !shouldPause) {
        this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.3);
        const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("BUY", orderId);
        this.lastOrderAskPrice = currentPrice.askPrice;
      }

      //
    } else if (positions[0] && balance.crypto > 0) {
      // Sell

      const gainLossPercent = calcPercentage(positions[0].price, currentPrice.bidPrice);
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);

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

      const profitable =
        (this.priceChangePercent / 2 <= 3 &&
          this.prevGainPercent > 2 &&
          this.prevGainPercent < 3 &&
          loss > 0.1) ||
        (this.prevGainPercent >= this.priceChangePercent && loss > this.prevGainPercent / 4);

      const stopLoss =
        this.losses[0] > Math.max(this.priceChangePercent / 2, 2) &&
        this.losses[1] > Math.max(this.losses[0] / 4, 1) &&
        this.losses[2] > Math.max(this.losses[1] / 4, 1);

      const protectPreviousProfit = trades.at(-1) >= 4 && this.prevGainPercent >= 1 && loss > 0.1;
      console.log("Here: ", protectPreviousProfit);

      if (((profitable || stopLoss) && safeAskBidSpread) || protectPreviousProfit) {
        this.dispatch("LOG", `Placing ${profitable ? "PROFITABLE" : "STOPLOSS"} order`);
        await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        this.lastTradeAge = 0;
        this.lastOrderBidPrice = positions[0].price;
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    }

    this.lastTradeAge++;
    this.dispatch("LOG", "");
  }

  updateTrends(trend) {
    if (this.trends.length >= 3) this.trends.shift();
    this.trends.push(trend);
  }
}

module.exports = MyTrader;
