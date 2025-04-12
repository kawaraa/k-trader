const Trader = require("./trader.js");
const { calcPercentageDifference, calculateFee, calcAveragePrice } = require("../services.js");
const { findPriceMovement } = require("../indicators.js");
const calcPercentage = calcPercentageDifference;
const maxPercentThreshold = 25;

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.range = (24 * 60) / this.interval;
    this.analysisPeriod = 3 * 24 * 60 + this.range * 5;
    this.lossLimit = 8;
    this.minPeriodBetweenOrders = (12 * 60) / 5;

    this.profitPercent = 0;
    this.lossPercent = 0;
    this.lastTradeAge = 0;
  }

  async run() {
    const period = this.analysisPeriod / this.interval;

    // Get data from Kraken
    const allPrices = await this.ex.prices(this.pair, period);
    const prices = allPrices.slice(-this.range);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.pair);
    const positions = await this.ex.getOrders(this.pair);
    const trades = await this.ex.getState(this.pair, "trades");

    if (allPrices.length < period) return;

    const strategyExpired =
      !this.strategyTest.timestamp ||
      this.strategyTest.timestamp / 60 > 12 ||
      (trades.at(-1) < 0 && this.strategyTest.timestamp / 60 > 3);
    if (!positions[0] && strategyExpired) {
      const test = this.runeTradingTest(allPrices);

      // if (!(trades.at(-1) > 0)) test.percentThreshold = test.percentThreshold * 1.2;
      if (test.loss == 0 && test.netProfit >= 0) this.strategyTest = { ...this.strategyTest, ...test };
      this.strategyTest.timestamp = 0;
      console.log("strategyTest: ", this.strategyTest);
    }

    this.strategyTest.timestamp += this.interval;
    if (!positions[0] && this.strategyTest.netProfit < 0) return;
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

    // const pause =
    //   trades.at(-1) >= this.strategyTest.percentThreshold && this.lastTradeAge < this.minPeriodBetweenOrders;
    const pause = (lastTowTradesAreLoss || tooMuchLosses) && this.lastTradeAge < this.minPeriodBetweenOrders;

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
    if (!position && askBidSpreadPercentage > averageAskBidSpread) return result; // safeAskBidSpread

    const bidPrices = prices.map((p) => p.bidPrice);

    // const sortedBidPrices = bidPrice.toSorted((a, b) => a - b);
    // const pricePercentThreshold = calcPercentage(sortedBidPrices[0], sortedBidPrices.at(-1));
    // if (pricePercentThreshold < priceChangePercent) return result;

    const buySellOnPercent = priceChangePercent / 5;

    if (position) {
      // Sell
      result.gainLossPercent = calcPercentage(position.price, bidPrice);
      if (result.gainLossPercent > result.profitPercent) result.profitPercent = result.gainLossPercent;
      if (result.gainLossPercent < result.lossPercent) result.lossPercent = result.gainLossPercent;

      const loss = result.profitPercent - result.gainLossPercent;
      const stopLossLimit = Math.max(Math.min(7, priceChangePercent), 3);

      if (result.profitPercent >= priceChangePercent / 2) result.signal = "SELL-PROFITABLE";
      else {
        const case1 = result.gainLossPercent < -stopLossLimit || loss > stopLossLimit;
        const case2 = result.profitPercent >= priceChangePercent / 3 && result.gainLossPercent <= 0;
        const case3 =
          // result.lossPercent < -(stopLossLimit / 1.5) &&
          result.lossPercent <= -Math.max(stopLossLimit / 1.3, 3) &&
          result.gainLossPercent > result.lossPercent / 2 &&
          findPriceMovement(
            bidPrices.slice(-parseInt(bidPrices.length / 8)),
            Math.abs(result.lossPercent / 4)
          ).includes("DROPPING");

        if (case1 || case2 || case3) result.signal = "SELL-STOP-LOSS";
      }

      //
    } else {
      // Buy

      const shortPeriodPrices = bidPrices.slice(-parseInt(bidPrices.length / 2));
      const movement = findPriceMovement(shortPeriodPrices, buySellOnPercent, priceChangePercent);
      // const movement = findPriceMovement(shortPeriodPrices, bidPrice, priceChangePercent); // To try

      // const averagePrice = calcAveragePrice(bidPrice);
      // const tooHigh = calcPercentage(averagePrice, currentPrice.bidPrice) > 0;
      // const percentFroLowest = calcPercentageDifference(sortedBidPrices[0], currentPrice.bidPrice);
      // const tooLow = percentFroLowest < -buySellOnPercent;
      if (movement.includes("INCREASING")) result.signal = "BUY";
    }

    return result;
  }

  runeTradingTest(prices, range = (6 * 60) / 5) {
    let percentage = 2;
    const result = { percentThreshold: maxPercentThreshold, netProfit: 0, trades: [] };

    while (percentage <= maxPercentThreshold) {
      const trades = [];
      let price = null; // pricePointer
      let profitPercent = 0;
      let lossPercent = 0;
      let lastTradeAge = 0;

      for (let i = range; i < prices.length; i++) {
        const newPrices = prices.slice(i - range, i);
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
      if (netProfit > result.trades.reduce((t, it) => t + it, 0)) {
        result.percentThreshold = percentage;
        result.netProfit = netProfit;
        result.gain = trades.reduce((t, it) => t + (it > 0 ? it : 0), 0);
        result.loss = trades.reduce((t, it) => t + (it < 0 ? it : 0), 0);
        result.transitions = trades.length;
        result.trades = trades;
      }

      percentage++;
    }
    return result;
  }
}

module.exports = MyTrader;
