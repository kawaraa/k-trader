const Trader = require("./trader.js");
const { calcPercentageDifference, calculateFee, calcAveragePrice } = require("../services.js");
const { findPriceMovement } = require("../indicators.js");
const maxPercentThreshold = 20;

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.strategyTest = { timestamp: 0, percentThreshold: 20 };
    this.analysisPeriod = 3 * 24 * 60;
    this.minPeriodBetweenOrders = (3 * 60) / 5;

    this.profitPercent = 0;
    this.lossPercent = 0;
    this.lastTradeAge = 0;
  }

  async run() {
    const period = this.analysisPeriod / this.interval;

    // Get data from Kraken
    const allPrices = await this.ex.prices(this.pair, period);
    const prices = allPrices.slice(-((12 * 60) / this.interval));
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.pair);
    const positions = await this.ex.getOrders(this.pair);
    const trades = await this.ex.getState(this.pair, "trades");
    // const tradePercentReturn = (trades.at(-1) / this.capital) * 100;

    if (allPrices.length < period) return;

    const strategyExpired =
      !this.strategyTest.timestamp || (!(trades.at(-1) > 0) && this.strategyTest.timestamp / 60 > 24);
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

    const pause = this.lastTradeAge < this.minPeriodBetweenOrders;
    console.log("decision: ", this.strategyTest.percentThreshold, decision);
    const prc = JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", ");
    this.dispatch("LOG", `€${balance.eur.toFixed(2)} - ${prc}`);

    if (positions[0]) {
      this.dispatch(
        "log",
        `Gain: ${this.profitPercent}% - Loss: ${(this.profitPercent - decision.gainLossPercent).toFixed(
          8
        )}% - Current: ${decision.gainLossPercent}%`
      );
    }

    if (decision.signal.includes("BUY") && !pause && !positions[0] && this.capital > 0 && balance.eur >= 5) {
      this.dispatch("LOG", `Placing BUY at ${currentPrice.askPrice}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      const cost = capital - calculateFee(capital, 0.4);
      const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
      const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
      this.dispatch("BUY", orderId);
      //
    } else if (positions[0] && balance.crypto > 0 && decision.signal.includes("SELL")) {
      this.dispatch("LOG", `Placing ${decision.signal} order`);
      await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
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
    prices,
    currentPrice,
    priceChangePercent = 3, //  priceChangePercent,
    profitPercent = 0,
    lossPercent = 0
  ) {
    const result = {
      signal: "HOLD",
      gainLossPercent: 0,
      profitPercent,
      lossPercent,
    };

    const askBidSpreadPercentage = calcPercentageDifference(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(
      prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
    );
    if (!position && askBidSpreadPercentage > averageAskBidSpread) return result; // safeAskBidSpread

    const bidPrice = prices.map((p) => p.bidPrice);
    const sortedBidPrices = bidPrice.toSorted((a, b) => a - b);
    const averagePrice = calcAveragePrice(bidPrice);
    // const pricePercentThreshold = calcPercentageDifference(sortedBidPrices[0], sortedBidPrices.at(-1));
    // if (pricePercentThreshold < priceChangePercent) return result;

    const percentFroLowest = calcPercentageDifference(sortedBidPrices[0], currentPrice.bidPrice);
    const buySellOnPercent = Math.min(2, priceChangePercent / 5);

    if (position) {
      // Sell
      result.gainLossPercent = calcPercentageDifference(position.price, currentPrice.bidPrice);
      if (result.gainLossPercent > result.profitPercent) result.profitPercent = result.gainLossPercent;
      if (result.gainLossPercent < result.lossPercent) result.lossPercent = result.gainLossPercent;

      const loss = result.profitPercent - result.gainLossPercent;
      const stopLossLimit = Math.max(Math.min(7, priceChangePercent), 3);

      if (result.profitPercent >= priceChangePercent / 2) {
        result.signal = "SELL-PROFITABLE";
        result.profitPercent = 0;
        result.lossPercent = 0;
        //
      } else if (percentFroLowest < -stopLossLimit || loss > stopLossLimit) {
        // if (
        //   result.lossPercent <= stopLossLimit &&
        //   result.lossPercent - result.gainLossPercent > result.lossPercent / 1.2 &&
        //   (!result.recoveredPrice || currentPrice.bidPrice > result.recoveredPrice.bidPrice)
        // ) {
        //   result.recoveredPrice = currentPrice;
        // }

        // const recoveryStopLoss =
        //   calcPercentageDifference(result.recoveredPrice?.bidPrice, currentPrice.bidPrice) <=
        //   -(priceChangePercent / 5);

        result.signal = "SELL-STOP-LOSS";
        result.profitPercent = 0;
        result.lossPercent = 0;
      }
    } else {
      // Buy

      const last3HrsPrices = bidPrice.slice(-parseInt(bidPrice.length / 2));
      const movement = findPriceMovement(last3HrsPrices, buySellOnPercent, priceChangePercent);
      const tooHigh = calcPercentageDifference(averagePrice, currentPrice.bidPrice) >= buySellOnPercent;
      const tooLow = percentFroLowest < -buySellOnPercent;
      if (!tooHigh && !tooLow && movement.includes("INCREASING")) result.signal = "BUY";
    }

    return result;
  }

  runeTradingTest(prices, range = (12 * 60) / 5) {
    let percentage = 2;
    const result = { percentThreshold: maxPercentThreshold, netProfit: 0, profit: 0, loss: 0, trades: 0 };

    while (percentage <= maxPercentThreshold) {
      let loss = 0;
      let profit = 0;
      let price = null; // pricePointer
      let trades = 0;
      let profitPercent = 0;
      let lossPercent = 0;
      let lastTradeAge = 0;

      for (let i = range; i < prices.length; i++) {
        const newPrices = prices.slice(i - range, i);
        const currentPrice = prices[i];
        const position = !price ? null : { price };

        const decision = this.decide(
          position,
          newPrices,
          currentPrice,
          percentage, //  priceChangePercent,
          profitPercent,
          lossPercent
        );
        profitPercent = decision.profitPercent;
        lossPercent = decision.lossPercent;
        lastTradeAge++;

        const pause = lastTradeAge <= this.minPeriodBetweenOrders;

        if (!pause && decision.signal.includes("BUY")) {
          // console.log("currentPrice: ", decision.signal, JSON.stringify(currentPrice));
          price = currentPrice.askPrice;
        } else if (decision.signal.includes("SELL-PROFITABLE")) {
          // console.log(decision.signal, JSON.stringify(currentPrice));
          // console.log(decision.gainLossPercent);
          profit += decision.gainLossPercent;
          trades++;
          price = null;
          lastTradeAge = 0;
        } else if (decision.signal.includes("SELL")) {
          // console.log(decision.signal, JSON.stringify(currentPrice));
          // console.log(decision.gainLossPercent);
          loss += decision.gainLossPercent;
          trades++;
          price = null;
          lastTradeAge = 0;
        }
      }

      // if (profit + loss > 0) {
      if (profit + loss > result.profit + result.loss) {
        result.percentThreshold = percentage;
        result.profit = +profit.toFixed(2);
        result.loss = +loss.toFixed(2);
        result.netProfit = result.profit + result.loss;
        result.trades = trades;
      }

      //  console.log(profit , loss, percentage);
      percentage++;
    }
    return result;
  }
}

module.exports = MyTrader;
