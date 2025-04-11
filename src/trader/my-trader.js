const Trader = require("./trader.js");
const { calcPercentageDifference, calcAveragePrice, calculateFee } = require("../services.js");
const { findPriceMovement } = require("../indicators.js");

// Smart trader
class MyTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.previouslyDropped = 0;
    this.previousProfit = 0;
    this.previousLoss = 0;
    this.recoveredLoss = 0;
    this.averageAskBidSpread;
    this.analysisPeriod = 1 * 24;
    this.ranges = [90 / interval, 180 / interval];
    this.strategyTest = { timestamp: 0, range: this.ranges[0] };
    this.droppedPercent = 0;
    this.lastTradeAge = 0;
  }

  async run() {
    const period = (this.analysisPeriod * 60) / this.interval;

    // Get data from Kraken
    const allPrices = await this.ex.prices(this.pair, period);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const currentPrice = await this.ex.currentPrices(this.pair); // { tradePrice, askPrice, bidPrice }
    const positions = await this.ex.getOrders(this.pair);
    const enoughPricesData = allPrices.length >= period;

    if (!enoughPricesData) return;

    const strategyExpired = !this.strategyTest.timestamp || this.strategyTest.timestamp / 60 > 24;
    if (!positions[0] && strategyExpired) {
      const test1 = this.runeTradingTest(allPrices, this.ranges[0]);
      const test2 = this.runeTradingTest(allPrices, this.ranges[1]);

      if (test1.loss == 0 && test1.netProfit >= 0 && test1.netProfit > test2.netProfit) {
        this.strategyTest = { ...this.strategyTest, ...test1, range: this.ranges[0] };
      } else if (test2.loss == 0 && test2.netProfit >= 0 && test2.netProfit >= test1.netProfit) {
        this.strategyTest = { ...this.strategyTest, ...test2, range: this.ranges[1] };
      }

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

    const prices = allPrices.slice(-this.strategyTest.range);
    const decision = this.decide(
      positions[0],
      prices,
      currentPrice,
      this.strategyTest.percentage,
      this.droppedPercent,
      this.previousProfit
    );
    this.droppedPercent = decision.droppedPercent;
    this.previousProfit = decision.prevProfit;

    const prc = JSON.stringify(currentPrice);
    const pause = this.lastTradeAge < this.strategyTest.range;
    const buy = decision.signal.includes("BUY");
    const sell = decision.signal.includes("SELL-PROFITABLE");
    const sellSTopLoss = decision.signal.includes("SELL-STOPLOSS");

    if (positions[0]) {
      this.dispatch(
        "log",
        `Gain: ${this.previousProfit}% - Loss: ${(this.previousProfit - decision.priceChange).toFixed(
          8
        )}% - Current: ${decision.priceChange}% `
      );
    }

    if (!pause && buy && this.capital > 0 && balance.eur >= 5) {
      // console.log("sss", this.strategyTest);
      this.dispatch("log", `Placing BUY at ${currentPrice.askPrice} ${prc}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      const cost = capital - calculateFee(capital, 0.4);
      const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
      const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
      this.dispatch("buy", orderId);
      //
    } else if (balance.crypto > 0 && (sell || sellSTopLoss)) {
      const orderType = sellSTopLoss ? "stopLoss" : "profitable";
      this.dispatch("log", `Placing ${orderType} order ${prc}`);
      await this.sell(positions[0], balance.crypto, currentPrice.bidPrice);
      this.previousProfit = 0;
      this.lastTradeAge = 0;
      //
    } else {
      this.dispatch("log", `Waiting for UPTREND signal`); // Log decision
    }

    this.dispatch("log", "");
  }

  decide(position, prices, currentPrice, priceChangePercent, droppedPercent = 0, prevProfit = 0) {
    const result = { signal: "HOLD", priceChange: 0, droppedPercent, prevProfit };
    const bidPrices = prices.map((p) => p.bidPrice);
    const askBidSpreadPercentage = calcPercentageDifference(currentPrice.bidPrice, currentPrice.askPrice);
    const averageAskBidSpread = calcAveragePrice(
      prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
    );
    const safeAskBidSpread = askBidSpreadPercentage <= averageAskBidSpread * 1.1;

    if (!safeAskBidSpread) return result;
    const percentLimit = Math.abs(result.droppedPercent);

    if (position) {
      result.priceChange = calcPercentageDifference(position.price, currentPrice.bidPrice);
      if (result.priceChange > result.prevProfit) result.prevProfit = result.priceChange;

      if (
        result.priceChange >= percentLimit / 2 &&
        result.prevProfit - result.priceChange >= percentLimit / 5
      ) {
        result.signal = "SELL-PROFITABLE";
        result.prevProfit = 0;

        // const takeProfit =
        //   (orderPriceChange > profitPercent && loss >= buySellOnPercent) ||
        //   (!safeAskBidSpread &&
        //     this.previousProfit > profitPercent &&
        //     loss >= buySellOnPercent &&
        //     direction.includes("DROPPING"));
      } else if (result.priceChange <= -Math.max(percentLimit, 10)) {
        result.signal = "SELL-STOPLOSS";
        result.prevProfit = 0;

        // || (orderPriceChange < -profitPercent && direction.includes("DROPPING"));
        //  const stopLoss =
        //    orderPriceChange <= -stopLossPercent || (orderPriceChange <= 0 && direction.includes("DROPPING"));
        // const stopLoss = loss >= stopLossPercent && orderPriceChange < 0;
      }

      // Todo, Sell when, DOWNTREND, DROPPING, position profit drops current profit percent / 5 or 4,
      // and the profit target is 1%, dynamic profit target from the drop percent, specific profit target defined by test of the last 3 days
      // The same for StopLoss limit
    } else {
      result.priceChange = 0;
      const highest = bidPrices.toSorted().at(-1);
      const orderChange = calcPercentageDifference(highest, currentPrice.askPrice);
      if (!result.droppedPercent || orderChange < result.droppedPercent) {
        result.droppedPercent = orderChange;
      }

      const dropped = result.droppedPercent < -(priceChangePercent * 1.5);
      const priceDirection = findPriceMovement(bidPrices, Math.max(percentLimit / 5, 0.5));
      const increasing = priceDirection.includes("INCREASING");
      if (dropped && increasing) result.signal = "BUY";
    }

    return result;
  }

  runeTradingTest(prices, range = 18) {
    let percentage = 2;
    const maxPercentage = 20;
    const result = { percentage: maxPercentage, netProfit: 0, profit: 0, loss: 0, trades: 0 };

    while (percentage <= maxPercentage) {
      let prevProfit = 0;
      let loss = 0;
      let profit = 0;
      let price = null; // pricePointer
      let trades = 0;
      let droppedPercent = null;
      let lastTradeAge = 0;

      for (let i = range; i < prices.length; i++) {
        lastTradeAge++;
        if (lastTradeAge < range) continue;
        const currentPrice = prices[i];
        const newPrices = prices.slice(i - range, i);
        const position = !price ? null : { price };

        const decision = this.decide(
          position,
          newPrices,
          currentPrice,
          percentage,
          droppedPercent,
          prevProfit
        );
        droppedPercent = decision.droppedPercent;
        prevProfit = decision.prevProfit;

        if (decision.signal.includes("BUY")) price = currentPrice.askPrice;
        if (decision.signal.includes("SELL-PROFITABLE")) {
          profit += decision.priceChange;
          trades++;
          price = null;
        } else if (decision.signal.includes("SELL-PROFITABLE")) {
          loss += decision.priceChange;
          trades++;
          price = null;
        }
      }

      if (profit + loss > result.profit + result.loss) {
        result.percentage = percentage;
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
