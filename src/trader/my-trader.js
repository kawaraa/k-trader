const Trader = require("./trader.js");
const { calcPercentageDifference, calcAveragePrice, calculateFee } = require("../services.js");
const { runeTradingTest, findPriceMovement } = require("../indicators.js");

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
    this.lastTradeAge = 0;
  }

  async run() {
    const period = (this.analysisPeriod * 60) / this.interval;

    // Get data from Kraken
    const allPrices = await this.ex.prices(this.pair, period);
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.pair);
    const positions = await this.ex.getOrders(this.pair);
    const enoughPricesData = allPrices.length >= period;

    if (!enoughPricesData) return;

    const strategyExpired = !this.strategyTest.timestamp || this.strategyTest.timestamp / 60 > 24;
    if (!positions[0] && strategyExpired) {
      const test1 = runeTradingTest(allPrices, this.ranges[0]);
      const test2 = runeTradingTest(allPrices, this.ranges[1]);

      if (test1.loss == 0 && test1.netProfit >= 0 && test1.netProfit > test2.netProfit) {
        this.strategyTest = { ...this.strategyTest, ...test1, range: this.ranges[0] };
      } else if (test2.loss == 0 && test2.netProfit >= 0 && test2.netProfit >= test1.netProfit) {
        this.strategyTest = { ...this.strategyTest, ...test2, range: this.ranges[1] };
      }

      this.strategyTest.timestamp = 0;
    }

    this.strategyTest.timestamp += this.interval;
    const { dropPercent, buySellOnPercent, profitPercent, stopLossPercent } = this.strategyTest;
    if (!positions[0] && this.strategyTest.netProfit < 0) return;
    this.lastTradeAge++;

    this.dispatch(
      "log",
      `€${balance.eur.toFixed(2)} - Trade: ${tradePrice} Ask: ${askPrice} Bid: ${bidPrice}`
    );

    const prices = allPrices.slice(-this.strategyTest.range);
    const bidPrices = prices.map((p) => p.bidPrice);
    const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);
    const averageAskBidSpread = calcAveragePrice(
      prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
    );

    const safeAskBidSpread = askBidSpreadPercentage <= averageAskBidSpread;
    const prc = JSON.stringify({ tradePrice, askPrice, bidPrice });
    const pause = this.lastTradeAge < this.strategyTest.range;

    const highestBidPr = bidPrices.toSorted().at(-1);
    const dropped = calcPercentageDifference(highestBidPr, askPrice) < -dropPercent;
    const direction = findPriceMovement(bidPrices, buySellOnPercent);

    console.log("safeAskBidSpread", safeAskBidSpread);
    if (!positions[0] && !pause && safeAskBidSpread && this.capital > 0 && balance.eur >= 5) {
      if (dropped && direction.includes("INCREASING")) {
        console.log("sss", this.strategyTest);
        this.dispatch("log", `Placing BUY at ${askPrice} ${prc}`);
        const capital = balance.eur < this.capital ? balance.eur : this.capital;
        const cost = capital - calculateFee(capital, 0.4);
        const investingVolume = +(cost / askPrice).toFixed(8);
        const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
        this.dispatch("buy", orderId);
      } else {
        this.dispatch("log", `Waiting for UPTREND signal`);
      }
    } else if (positions[0] && safeAskBidSpread && balance.crypto > 0) {
      // Todo, Sell when, DOWNTREND, DROPPING, position profit drops current profit percent / 5 or 4,
      // and the profit target is 1%, dynamic profit target from the drop percent, specific profit target defined by test of the last 3 days
      // The same for StopLoss limit

      const orderPriceChange = calcPercentageDifference(positions[0].price, bidPrice);
      if (orderPriceChange > this.previousProfit) this.previousProfit = orderPriceChange;

      const loss = this.previousProfit - orderPriceChange;

      // const takeProfit = orderPriceChange >= profitPercent;
      const takeProfit = this.previousProfit > profitPercent && loss >= buySellOnPercent;
      // const takeProfit =
      //   (orderPriceChange > profitPercent && loss >= buySellOnPercent) ||
      //   (!safeAskBidSpread &&
      //     this.previousProfit > profitPercent &&
      //     loss >= buySellOnPercent &&
      //     direction.includes("DROPPING"));

      const stopLoss = orderPriceChange <= -Math.max(stopLossPercent, 10);
      // || (orderPriceChange < -profitPercent && direction.includes("DROPPING"));
      //  const stopLoss =
      //    orderPriceChange <= -stopLossPercent || (orderPriceChange <= 0 && direction.includes("DROPPING"));
      // const stopLoss = loss >= stopLossPercent && orderPriceChange < 0;

      this.dispatch(
        "log",
        `Gain: ${this.previousProfit}% - Loss: ${loss.toFixed(8)}% - Current: ${orderPriceChange}% `
      );

      if (takeProfit || stopLoss) {
        const orderType = stopLoss ? "stopLoss" : "profitable";
        this.dispatch("log", `Placing ${orderType} order ${prc}`);
        await this.sell(positions[0], balance.crypto, bidPrice);
        this.previousProfit = 0;
        this.lastTradeAge = 0;
      }
    }

    this.dispatch("log", "");
  }
}

module.exports = MyTrader;
