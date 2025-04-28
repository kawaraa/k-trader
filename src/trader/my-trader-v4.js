const Trader = require("./trader.js");
const { isOlderThan, getMaxMin, isNumberInRangeOf } = require("../utilities.js");
const { calcPercentageDifference, calculateFee, calcAveragePrice } = require("../services.js");
const { findPriceMovement, linearRegression } = require("../indicators.js");
const calcPercentage = calcPercentageDifference;
const maxPercentThreshold = 25;

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    // this.longRange = (8 * 60) / this.interval;
    this.shortRange = (5 * 60) / this.interval;
    this.analysisPeriod = 3 * 24 * 60 + this.shortRange * 5;
    this.lossLimit = 8;
    // this.minPeriodBetweenOrders = this.shortRange; // Or (12 * 60) / 5;

    this.profitPercent = 0;
    this.lossPercent = 0;
    this.lastTradeAge = 0;
  }

  async run() {
    const period = this.analysisPeriod / this.interval;

    // Get data from Kraken
    const allPrices = await this.ex.prices(this.pair, period);
    const prices = allPrices.slice(-this.shortRange);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.pair);
    const positions = await this.ex.getOrders(this.pair);
    const { trades } = await this.ex.state.getBot(this.pair);

    if (allPrices.length < period) return;

    const strategyExpired =
      !this.strategyTest.timestamp ||
      this.strategyTest.timestamp / 60 > 12 ||
      (trades.at(-1) < 0 && this.strategyTest.timestamp / 60 > 3);

    if (!positions[0] && strategyExpired) {
      const test = this.runeTradingTest(allPrices);

      // if (!(trades.at(-1) > 0)) test.percentThreshold = test.percentThreshold * 1.2;
      // test.loss == 0 &&
      if (test.loss == 0 && test.netProfit > 0) this.strategyTest = { ...this.strategyTest, ...test };
      this.strategyTest.timestamp = 0;
      // console.log("strategyTest: ", this.strategyTest);
    }

    this.strategyTest.timestamp += this.interval;
    if (!positions[0] && this.strategyTest.netProfit <= 0) return;
    this.lastTradeAge++;

    const currentPrice = { tradePrice, askPrice, bidPrice };
    const decision = this.decide(
      positions[0],
      prices,
      currentPrice,
      this.strategyTest.percentThreshold, //  priceChangePercent,
      this.profitPercent,
      this.lossPercent
    );
    this.profitPercent = decision.profitPercent;
    this.lossPercent = decision.lossPercent;

    const lastTowTradesAreLoss =
      trades.at(-1) < -this.lossLimit || trades.at(-1) + trades.at(-2) < -this.lossLimit;
    const tooMuchLosses =
      -trades.reduce((t, it) => t + it + (it < 0 ? it : 0), 0) >
      trades.reduce((t, it) => t + it + (it > 0 ? it : 0), 0) / 3;

    const pauseCase = trades.at(-1) >= 4;
    const pause = (lastTowTradesAreLoss || tooMuchLosses || pauseCase) && this.lastTradeAge < this.shortRange;

    console.log("decision: ", this.strategyTest.percentThreshold, decision);
    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    if (positions[0]) {
      this.dispatch(
        "LOG",
        `Gain: ${this.profitPercent}% - Loss: ${this.lossPercent}% - Current: ${decision.gainLossPercent}%`
      );
    }

    if (decision.signal.includes("BUY") && !pause && !positions[0] && this.capital > 0 && balance.eur >= 5) {
      this.dispatch("LOG", `Placing BUY at ${askPrice}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      const cost = capital - calculateFee(capital, 0.4);
      const investingVolume = +(cost / askPrice).toFixed(8);
      const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
      this.dispatch("BUY", orderId);
      //
    } else if (positions[0] && balance.crypto > 0 && decision.signal.includes("SELL")) {
      this.dispatch("LOG", `Placing ${decision.signal} order`);
      await this.sell(positions[0], balance.crypto, bidPrice);
      this.profitPercent = 0;
      this.lossPercent = 0;
      this.lastTradeAge = 0;
      //
    }
    // else {
    //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    // }

    this.dispatch("LOG", "");
  }

  decide(position, prices, currentPrice, priceChangePercent = 3, profitPercent = 0, lossPercent = 0) {
    const { askPrice, bidPrice } = currentPrice;
    const result = { signal: "HOLD", gainLossPercent: 0, profitPercent, lossPercent };

    const askBidSpreadPercentage = calcPercentage(bidPrice, askPrice);
    const averageAskBidSpread = calcAveragePrice(prices.map((p) => calcPercentage(p.bidPrice, p.askPrice)));
    if (askBidSpreadPercentage > averageAskBidSpread * 1.1) return result; // safeAskBidSpread

    const bidPrices = prices.map((p) => p.bidPrice);

    // const sortedBidPrices = bidPrice.toSorted((a, b) => a - b);
    // const pricePercentThreshold = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    // if (pricePercentThreshold < priceChangePercent) return result;

    if (position) {
      // Sell
      result.gainLossPercent = calcPercentage(position.price, bidPrice);

      const loss = result.profitPercent - result.gainLossPercent;

      const case1 =
        result.profitPercent >= getMaxMin(priceChangePercent / 2, 3, 4) && loss >= result.profitPercent / 4;
      const case2 =
        result.profitPercent >= getMaxMin(priceChangePercent / 2, 4, priceChangePercent) &&
        loss >= result.profitPercent / 5;

      if (case1 || case2) result.signal = "SELL-PROFITABLE";
      else {
        const stopLossLimit = getMaxMin(priceChangePercent / 2, 1.5, 3);
        const case1 =
          result.profitPercent >= Math.max(priceChangePercent / 4, 2) && result.gainLossPercent <= 0;
        const case2 =
          // result.lossPercent < -(stopLossLimit / 1.5) &&
          result.lossPercent <= -Math.max(stopLossLimit / 1.3, 3) &&
          result.gainLossPercent > result.lossPercent / 2 &&
          findPriceMovement(bidPrices.slice(-18), Math.abs(result.lossPercent / 4)).includes("DROPPING");
        const case3 = result.gainLossPercent < -stopLossLimit;

        if (case1 || case2 || case3) result.signal = "SELL-STOP-LOSS";
      }

      //
    } else {
      // Buy
      // const shortRangePrices = bidPrices.slice(-this.shortRange);
      const buyOnPercent = getMaxMin(priceChangePercent / 5, 0.5, 2);
      // const shouldBuy = linearRegression(bidPrices) > 0;
      const movement = findPriceMovement(bidPrices, buyOnPercent, priceChangePercent);
      if (movement.includes("INCREASING")) {
        // console.log(shouldBuy, movement, priceChangePercent, buyOnPercent);
        // console.log(linearRegression(shortRangePrices) < 0); // means it's dropping
      }
      // console.log(JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", "));

      // const averagePrice = calcAveragePrice(bidPrice);
      // const tooHigh = calcPercentage(averagePrice, currentPrice.bidPrice) > 0;
      // const percentFroLowest = calcPercentageDifference(sortedBidPrices[0], currentPrice.bidPrice);
      // const tooLow = percentFroLowest < -buyOnPercent;
      if (movement.includes("INCREASING")) {
        result.signal = "BUY";
      }
    }

    if (result.gainLossPercent > result.profitPercent) result.profitPercent = result.gainLossPercent;
    if (result.gainLossPercent < result.lossPercent) result.lossPercent = result.gainLossPercent;
    return result;
  }

  runeTradingTest(prices) {
    let percentage = 2;
    const result = { percentThreshold: maxPercentThreshold, netProfit: 0, trades: [] };

    while (percentage <= maxPercentThreshold) {
      const trades = [];
      let price = null; // pricePointer
      let profitPercent = 0;
      let lossPercent = 0;
      let lastTradeAge = 0;

      for (let i = this.shortRange; i < prices.length; i++) {
        const newPrices = prices.slice(i - this.shortRange, i);
        const currentPrice = prices[i];
        const position = !price ? null : { price };
        // const lastTowTradesAreLoss = trades.at(-1) < 0 && trades.at(-2) < 0;
        // const tooMuchLosses =
        //   -trades.reduce((t, it) => t + it + (it < 0 ? it : 0), 0) >
        //   trades.reduce((t, it) => t + it + (it > 0 ? it : 0), 0) / 3;
        // const lastTowTradesAreLoss = lastTradeIsLoss && trades.at(-2) < 0;
        // const lastTowTradesAreGain = lastTradeIsLoss && trades.at(-1) > 0 && trades.at(-2) > 0;

        const decision = this.decide(
          position,
          newPrices,
          currentPrice,
          percentage,
          profitPercent,
          lossPercent
        );
        profitPercent = decision.profitPercent;
        lossPercent = decision.lossPercent;
        lastTradeAge++;

        // const pause = trades.at(-1) < 0 && lastTradeAge <= this.minPeriodBetweenOrders;
        // const pause = (lastTowTradesAreLoss || tooMuchLosses) && lastTradeAge < this.minPeriodBetweenOrders;
        // const pause = trades.at(-1) >= percentage && lastTradeAge <= this.minPeriodBetweenOrders;

        if (decision.signal.includes("BUY")) {
          price = currentPrice.askPrice;
        } else if (decision.signal.includes("SELL-PROFITABLE")) {
          trades.push(decision.gainLossPercent);
          price = null;
          lastTradeAge = 0;
        } else if (decision.signal.includes("SELL")) {
          trades.push(decision.gainLossPercent);
          price = null;
          lastTradeAge = 0;
        }
      }

      const netProfit = trades.reduce((t, it) => t + it, 0);
      const gain = trades.reduce((t, it) => t + (it > 0 ? it : 0), 0);
      const loss = trades.reduce((t, it) => t + (it < 0 ? it : 0), 0);
      // (loss == 0 && gain > 0) ||
      // console.log("NetProfit:", netProfit, "Trades:", trades.length);
      if (netProfit > result.trades.reduce((t, it) => t + it, 0)) {
        result.percentThreshold = percentage;
        result.netProfit = netProfit;
        result.gain = gain;
        result.loss = loss;
        result.transitions = trades.length;
        result.trades = trades;
      }

      percentage++;
    }
    return result;
  }
}

module.exports = MyTrader;
