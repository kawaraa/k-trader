const Trader = require("./trader.js");

const { calcPercentageDifference, calculateFee, calcAveragePrice } = require("../services.js");
const { findPriceMovement, linearRegression } = require("../indicators.js");
const calcPercentage = calcPercentageDifference;

function detectTrendBasedCloses(prices) {
  const slope = linearRegression(prices);
  if (slope > 0.0000001) return "UPTREND";
  if (slope < -0.0000001) return "DOWNTREND";
  return "SIDEWAYS";
}

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.range = (10 * 60) / this.interval;
    this.priceChangePercent = 4;

    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.trends = "x-x-x";
    this.lastTradeAge = 0;
    this.lastOrderPrice = 0;
  }

  async run() {
    // Get data from Kraken
    const prices = await this.ex.prices(this.pair, this.range); // Change this to 12 hrs if 24 is not used
    const bidPrices = prices.map((p) => p.bidPrice);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = await this.ex.getOrders(this.pair);
    const trades = await this.ex.getState(this.pair, "trades");
    const currentPrice = prices.at(-1);

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
    const safeAskBidSpread = askBidSpreadPercentage <= averageAskBidSpread * 1.1; // safeAskBidSpread

    const sortedBidPrices = bidPrices.toSorted((a, b) => a - b);
    const pricePercentThreshold = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    if (!positions[0]) this.priceChangePercent = pricePercentThreshold;

    this.updateTrends(detectTrendBasedCloses(bidPrices));

    const movement = findPriceMovement(
      bidPrices,
      Math.max(this.priceChangePercent / 6, 1),
      Math.max(this.priceChangePercent, 3)
    );
    const increasing = movement.includes("INCREASING");
    const dropping = movement.includes("DROPPING");

    console.log("priceChangePercent", this.priceChangePercent);
    console.log("trend", this.trends, movement);

    if (!positions[0] && this.capital > 0 && balance.eur >= 5) {
      // Buy
      let shouldBuy = false;

      const case1 = this.trends.includes("UPTREND-SIDEWAYS-DOWNTREND") && increasing;
      const case2 = this.trends.includes("SIDEWAYS-UPTREND-DOWNTREND") && increasing;
      const case3 = this.trends.includes("DOWNTREND-UPTREND-DOWNTREND") && increasing;

      // const case1 = this.trends.includes("-DOWNTREND-SIDEWAYS");
      // const case2 = this.trends.includes("SIDEWAYS-UPTREND-SIDEWAYS");
      // const case3 = this.trends.at(-2) == "DOWNTREND" && this.trends.at(-1) == "SIDEWAYS";
      // DOWNTREND-SIDEWAYS-DOWNTREND
      // SIDEWAYS-DOWNTREND-SIDEWAYS
      // SIDEWAYS-UPTREND-SIDEWAYS
      // UPTREND-DOWNTREND-SIDEWAYS

      // DOWNTREND-UPTREND-DOWNTREND INCREASING

      // Don't buy: DOWNTREND-UPTREND-DOWNTREND

      if ((case1 || case2 || case3) && this.lastTradeAge > this.range) {
        shouldBuy = true;
      }

      if (shouldBuy && safeAskBidSpread) {
        this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.3);
        const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("BUY", orderId);

        //
      }
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

      // if (this.losses[1]) {
      //   this.losses[2] = +(loss - (this.losses[0] - this.losses[1])).toFixed(2); // drops after it's recovered
      // }

      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      const profitable =
        gainLossPercent > Math.max(this.priceChangePercent / 2, 4) && loss > this.priceChangePercent / 4;
      // const stopLoss =
      //   gainLossPercent < -5 ||
      //   (this.losses[0] > Math.max(this.priceChangePercent / 3, 4) &&
      //     this.losses[1] > Math.max(this.losses[0] / 2, 2) &&
      //     this.losses[2] > Math.max(this.losses[1] / 2, 1));

      // DOWNTREND-SIDEWAYS-UPTREND DROPPING
      const case1 = this.trends.includes("-SIDEWAYS-UPTREND") && dropping;
      const case2 =
        this.trends.includes("-DOWNTREND-UPTREND") &&
        (dropping || gainLossPercent < -this.priceChangePercent);
      const case3 = this.trends.includes("-SIDEWAYS-UPTREND");
      const case4 = this.trends.includes("-UPTREND-UPTREND") && dropping;

      console.log(case1, case2, case3, safeAskBidSpread);

      if ((case1 || case2 || case3 || case4) && safeAskBidSpread) {
        this.dispatch("LOG", `Placing ${profitable ? "PROFITABLE" : "STOPLOSS"} order`);
        await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        this.lastTradeAge = 0;
        this.lastOrderPrice = positions[0].price;
        // this.trends = "x-x-x";
        //
      }

      //
    } else {
      //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    }

    this.lastTradeAge++;
    this.dispatch("LOG", "");
  }

  updateTrends(trend) {
    const arr = this.trends.split("-");
    if (arr.at(-1) != trend) arr.push(trend);
    if (arr.length > 3) arr.shift();
    this.trends = arr.join("-");
  }
}

module.exports = MyTrader;
