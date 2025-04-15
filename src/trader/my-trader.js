const Trader = require("./trader.js");
const { getMaxMin, isNumberInRangeOf, isOlderThan } = require("../utilities.js");
const { calcPercentageDifference, calculateFee, calcAveragePrice, smoothPrices } = require("../services.js");
const { findPriceMovement, linearRegression } = require("../indicators.js");
const calcPercentage = calcPercentageDifference;
const maxPercentThreshold = 25;

function detectTrendBasedCloses(prices) {
  const slope = linearRegression(prices);
  if (slope > 0) return "uptrend";
  if (slope < 0) return "downtrend";
  return "sideways";
}

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.longRange = (24 * 60) / this.interval;
    // this.shortRange = (6 * 60) / this.interval;
    this.analysisPeriod = 1 * 24 * 60 + this.longRange * 5;
    this.lossLimit = 8;
    // this.minPeriodBetweenOrders = this.shortRange; // Or (12 * 60) / 5;
    this.priceChangePercent = 3;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.prevShortTrend = null;
    this.prevLongTrend = null;
    this.lastTradeAge = 0;
    this.lastOrderPrice = 0;
  }

  async run() {
    // const period = this.analysisPeriod / this.interval;

    // Get data from Kraken
    const allPrices = await this.ex.prices(this.pair, this.longRange);
    const last12HrsPrices = allPrices.slice(-parseInt(this.longRange / 2));
    const last6HrsPrices = allPrices.slice(-parseInt(this.longRange / 4));
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = await this.ex.getOrders(this.pair);
    const trades = await this.ex.getState(this.pair, "trades");
    const currentPrice = allPrices.at(-1);

    if (allPrices.length < this.longRange) return;

    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);
    console.log("priceChangePercent", this.priceChangePercent);

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
    if (!positions[0] && pricePercentThreshold > 3) this.priceChangePercent = pricePercentThreshold;

    const pauseCase1 = this.lastTradeAge < this.longRange / 4;
    const pauseCase2 = calcPercentage(this.lastOrderPrice, currentPrice.askPrice) < 1;
    const shouldPause =
      trades.at(-1) > Math.max(this.priceChangePercent / 2, 3) && (pauseCase1 || pauseCase2);

    if (!positions[0] && this.capital > 0 && balance.eur >= 5) {
      // Buy
      let shouldBuy = false;
      const longPeriodTrend = detectTrendBasedCloses(allPrices.map((p) => p.bidPrice));
      const shortPeriodTrend = detectTrendBasedCloses(last12HrsPrices.map((p) => p.bidPrice));
      if (!this.prevShortTrend && shortPeriodTrend != "downtrend") this.prevShortTrend = shortPeriodTrend;
      if (!this.prevLongTrend && longPeriodTrend != "downtrend") this.prevLongTrend = longPeriodTrend;

      if (this.prevShortTrend == "uptrend" && shortPeriodTrend == "downtrend") {
        const movement = findPriceMovement(
          last6HrsPricesBidPrices,
          Math.max(this.priceChangePercent / 5, 0.5),
          this.priceChangePercent / 2
        );
        // console.log("BUY - shortPeriodTrend", movement);
        // shouldBuy = true;
        // this.prevShortTrend = null;

        if (movement.includes("INCREASING")) {
          // console.log("BUY - shortPeriodTrend", currentPrice, "\n");
          shouldBuy = true;
          this.prevShortTrend = null;
        }
      } else if (this.prevLongTrend == "uptrend" && longPeriodTrend == "downtrend") {
        const movement = findPriceMovement(last6HrsPricesBidPrices, 0.5, 2);
        // shouldBuy = true;
        // this.prevShortTrend = null;

        if (movement.includes("INCREASING")) {
          // console.log("BUY - longPeriodTrend", currentPrice, "\n");
          // shouldBuy = true;
          // this.prevLongTrend = null;
        }
      }

      // const buyOnPercent = getMaxMin(priceChangePercent / 5, 0.5, 2);
      // const movement = findPriceMovement(last6HrsPricesBidPrices, buyOnPercent, priceChangePercent / 1.2);
      // shouldBuy = movement.includes("INCREASING");

      if (shouldBuy && safeAskBidSpread && !shouldPause) {
        this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.3);
        const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("BUY", orderId);
        this.lastOrderPrice = 0;

        //
      }
    } else if (positions[0] && balance.crypto > 0) {
      // Sell

      // const stopLossLimit = Math.max(this.priceChangePercent / 2, 3);
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

      // const olderThan3Hrs = isOlderThan(positions[0].createdAt, ((this.longRange / 8) * 5) / 60);
      const profitable =
        (gainLossPercent >= 2 && gainLossPercent < 3 && loss > 0.1) ||
        (gainLossPercent >= 3 && loss > this.prevGainPercent / 4);
      const stopLoss =
        this.losses[0] > Math.max(this.priceChangePercent / 4, 2) &&
        this.losses[1] > Math.max(this.losses[0] / 4, 1) &&
        this.losses[2] > Math.max(this.losses[1] / 5, 1);

      if ((profitable || stopLoss) && safeAskBidSpread) {
        this.dispatch("LOG", `Placing ${profitable ? "PROFITABLE" : "STOPLOSS"} order`);
        await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        this.lastTradeAge = 0;
        this.lastOrderPrice = positions[0].price;
        //
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    }

    this.lastTradeAge++;
    this.dispatch("LOG", "");
  }
}

module.exports = MyTrader;
