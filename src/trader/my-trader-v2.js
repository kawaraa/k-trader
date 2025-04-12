const Trader = require("./trader.js");
const { calcPercentageDifference, calculateFee } = require("../services.js");
const maxPercentThreshold = 20;

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.highestPrices = null;
    this.lowestPrice = null;
    this.recoveredPrice = null;
    this.profitPercent = 0;
    this.lossPercent = 0;
    this.lastTradeAge = 0;
    // this.trades = [];
  }

  async run() {
    // Get data from Kraken
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const currentPrice = await this.ex.currentPrices(this.pair); // { tradePrice, askPrice, bidPrice }
    const positions = await this.ex.getOrders(this.pair);

    // this.trades.at(-1) < 0 &&
    const strategyExpired = !this.strategyTest.timestamp || this.strategyTest.timestamp / 60 > 24;
    if (!positions[0] && strategyExpired) {
      const test = this.runeTradingTest(await this.ex.prices(this.pair, (3 * 24 * 60) / this.interval));

      if (test.loss == 0 && test.netProfit >= 0) this.strategyTest = { ...this.strategyTest, ...test };
      this.strategyTest.timestamp = 0;
    }

    this.strategyTest.timestamp += this.interval;
    if (!positions[0] && this.strategyTest.netProfit < 0) return;
    this.lastTradeAge++;

    this.dispatch(
      "log",
      `€${balance.eur.toFixed(2)} - Trade: ${currentPrice.tradePrice} Ask: ${currentPrice.askPrice} Bid: ${
        currentPrice.bidPrice
      }`
    );

    const decision = this.decide(
      positions[0],
      currentPrice,
      // 9,
      this.strategyTest.percentThreshold, //  priceChangePercent,
      this.highestPrice,
      this.lowestPrice,
      this.recoveredPrice,
      this.profitPercent,
      this.lossPercent
    );

    this.highestPrice = decision.highestPrice;
    this.lowestPrice = decision.lowestPrice;
    this.recoveredPrice = decision.recoveredPrice;
    this.profitPercent = decision.profitPercent;
    this.lossPercent = decision.lossPercent;

    const prc = JSON.stringify(currentPrice);
    // const pause = this.lastTradeAge < this.strategyTest.range;

    if (positions[0]) {
      this.dispatch(
        "log",
        `Gain: ${this.profitPercent}% - Loss: ${(this.profitPercent - decision.gainLossPercent).toFixed(
          8
        )}% - Current: ${decision.gainLossPercent}% `
      );
    }

    if (decision.signal.includes("BUY") && this.capital > 0 && balance.eur >= 5) {
      console.log("StrategyTest: ", this.strategyTest);
      this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice} ${prc}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      const cost = capital - calculateFee(capital, 0.4);
      const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
      const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
      this.dispatch("BUY", orderId);
      //
    } else if (positions[0] && balance.crypto > 0 && decision.signal.includes("SELL")) {
      this.dispatch("LOG", `Placing ${decision.signal} order ${prc}`);
      await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
      // this.trades.push(decision.gainLossPercent);
      // console.log(this.trades);
      this.previousProfit = 0;
      this.lastTradeAge = 0;
      //
    }
    // else {
    //   this.dispatch("LOG", `Waiting for UPTREND signal`); // Log decision
    // }

    this.dispatch("LOG", "");
  }

  decide(
    position,
    currentPrice,
    priceChangeLimit = 3, //  priceChangePercent,
    highestPrice,
    lowestPrice,
    recoveredPrice,
    profitPercent = 0,
    lossPercent = 0
  ) {
    const result = {
      signal: "HOLD",
      highestPrice,
      lowestPrice,
      recoveredPrice,
      gainLossPercent: 0,
      profitPercent,
      lossPercent,
    };

    if (!result.highestPrice || currentPrice.bidPrice > result.highestPrice.bidPrice) {
      result.highestPrice = currentPrice;
    } else if (!result.lowestPrice || currentPrice.askPrice < result.lowestPrice.askPrice) {
      result.lowestPrice = currentPrice;
    }

    const droppedPercent = calcPercentageDifference(result.highestPrice.bidPrice, currentPrice.askPrice);
    const percentLimit = Math.abs(droppedPercent);

    // result.gainLossPercent = 0;
    if (position) {
      // Sell
      result.gainLossPercent = calcPercentageDifference(position.price, currentPrice.bidPrice);
      if (result.gainLossPercent > result.profitPercent) result.profitPercent = result.gainLossPercent;
      if (result.gainLossPercent < result.lossPercent) result.lossPercent = result.gainLossPercent;

      const loss = result.profitPercent - result.gainLossPercent;

      if (result.profitPercent >= percentLimit / 2 && loss >= percentLimit / 5) {
        result.signal = "SELL-PROFITABLE";
        result.highestPrice = null;
        result.lowestPrice = null;
        result.profitPercent = 0;
        result.lossPercent = 0;
      } else {
        // Todo try: the price should be close to the lowest price in the past 6, 12 hrs"
        const droppedFromLow = calcPercentageDifference(result.lowestPrice.bidPrice, currentPrice.bidPrice);
        const stopLossLimit = Math.max(Math.min(percentLimit, 5), 3);

        if (
          result.lossPercent <= stopLossLimit &&
          result.lossPercent - result.gainLossPercent > result.lossPercent / 1.2 &&
          (!result.recoveredPrice || currentPrice.bidPrice > result.recoveredPrice.bidPrice)
        ) {
          result.recoveredPrice = currentPrice;
        }

        const recoveryStopLoss =
          calcPercentageDifference(result.recoveredPrice?.bidPrice, currentPrice.bidPrice) <=
          -(percentLimit / 5);

        const stopLoss = Math.abs(droppedFromLow) >= stopLossLimit * 1.2;

        // Math.max(Math.min(percentLimit, 10), 5);
        if (recoveryStopLoss || stopLoss) {
          result.signal = stopLoss ? "SELL-STOP-LOSS" : "SELL-RECOVERY-STOP-LOSS";
          result.highestPrice = null;
          result.lowestPrice = null;
          result.recoveredPrice = 0;
          result.profitPercent = 0;
          result.lossPercent = 0;
        }
      }
    } else {
      // Buy
      const increasePercent = calcPercentageDifference(result.lowestPrice?.bidPrice, currentPrice.askPrice);

      if (droppedPercent <= -priceChangeLimit && increasePercent > percentLimit / 5) {
        result.signal = "BUY";
      }
    }

    return result;
  }

  runeTradingTest(prices) {
    let percentage = 2;
    const result = { percentThreshold: maxPercentThreshold, netProfit: 0, profit: 0, loss: 0, trades: 0 };

    while (percentage <= maxPercentThreshold) {
      let loss = 0;
      let profit = 0;
      let price = null; // pricePointer
      let trades = 0;
      let highestPrice = null;
      let lowestPrice = null;
      let recoveredPrice = null;
      let profitPercent = 0;
      let lossPercent = 0;

      for (let i = 0; i < prices.length; i++) {
        const currentPrice = prices[i];
        const position = !price ? null : { price };

        const decision = this.decide(
          position,
          currentPrice,
          percentage, //  priceChangePercent,
          highestPrice,
          lowestPrice,
          recoveredPrice,
          profitPercent,
          lossPercent
        );
        highestPrice = decision.highestPrice;
        lowestPrice = decision.lowestPrice;
        recoveredPrice = decision.recoveredPrice;
        profitPercent = decision.profitPercent;
        lossPercent = decision.lossPercent;

        if (decision.signal.includes("BUY")) {
          // console.log("highestPrice:", decision.signal, JSON.stringify(highestPrice));
          // console.log("lowestPrice: ", decision.signal, JSON.stringify(lowestPrice));
          // console.log("currentPrice: ", decision.signal, JSON.stringify(currentPrice));
          price = currentPrice.askPrice;
        } else if (decision.signal.includes("SELL-PROFITABLE")) {
          // console.log(decision.signal, JSON.stringify(currentPrice));
          // console.log();
          profit += decision.gainLossPercent;
          trades++;
          price = null;
        } else if (decision.signal.includes("SELL")) {
          // console.log(decision.signal, JSON.stringify(currentPrice));
          // console.log();
          if (decision.gainLossPercent > 0) profit += decision.gainLossPercent;
          else loss += decision.gainLossPercent;
          trades++;
          price = null;
        }
      }

      // console.log(result);
      if (profit + loss > result.profit + result.loss) {
        result.percentThreshold = percentage;
        result.profit = +profit.toFixed(2);
        result.loss = +loss.toFixed(2);
        result.netProfit = result.profit + result.loss;
        result.trades = trades;
      }

      percentage++;
    }
    return result;
  }
}

module.exports = MyTrader;
