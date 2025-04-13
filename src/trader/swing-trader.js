const Trader = require("./trader.js");

const { calcPercentageDifference, calcAveragePrice, calculateFee } = require("../services.js");
const { detectPriceDirection, detectBreakoutOrBreakdown } = require("../trend-analysis.js");
// const TestExchangeProvider = require("./test-ex-provider.js");

// Smart Swing Trader
class SwingTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    this.listener = null;

    this.previouslyDropped = 0;
    this.previousProfit = 0;
    this.previousLoss = 0;
    this.recoveredLoss = 0;
    this.averageAskBidSpread;
    this.analysisPeriod = 3 * 24;
    this.paused = false;
    this.previousPattern = "";
    this.breakdowns = [1];
  }

  async run() {
    // const trades = await this.ex.getState(this.pair, "trades");
    // const totalProfit = (trades.filter((t) => t > 0).reduce((acc, n) => acc + n, 0) / this.capital) * 100;
    // const totalLoss = -((trades.filter((t) => t < 0).reduce((acc, n) => acc + n, 0) / this.capital) * 100);
    // const trade1 = (trades.at(-1) / this.capital) * 100;
    // const trade2 = (trades.at(-2) / this.capital) * 100;
    const period = (24 * 60) / this.interval;

    // Get data from Kraken
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.pair);
    const prices = await this.ex.prices(this.pair, period); // For the last xxx hours

    const positions = await this.ex.getOrders(this.pair);
    const enoughPricesData = prices.length >= period;

    this.dispatch(
      "log",
      `€${balance.eur.toFixed(2)} - Trade: ${tradePrice} Ask: ${askPrice} Bid: ${bidPrice}`
    );

    if (enoughPricesData) {
      const bidPrices = prices.map((p) => p.bidPrice);
      // const shortLength = parseInt(bidPrices.length / 8); // <==================XXXXXX
      const shortLength = parseInt(bidPrices.length / 8); // <==================XXXXXX
      const highestBidPr = bidPrices
        .slice(-shortLength)
        .toSorted((a, b) => a - b)
        .at(-1);
      this.breakdowns.push(Math.max(-calcPercentageDifference(highestBidPr, bidPrice), 1));
      if (this.breakdowns.length > 10) this.breakdowns.shift();

      const profitAndStopLossPercentLimit = getDynamicTakeProfitPct(bidPrices) * 100 * this.interval;
      const last90MinsPrices = bidPrices.slice(shortLength);
      const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);
      const averageAskBidSpread = calcAveragePrice(
        prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
      );
      const safeAskBidSpread = askBidSpreadPercentage <= averageAskBidSpread;
      // console.log("======> Percent: ", profitAndStopLossPercentLimit);
      const patternLong = detectBreakoutOrBreakdown(bidPrices, 2);
      const patternShort = detectBreakoutOrBreakdown(last90MinsPrices, 1);
      const priceDirectionLong = detectPriceDirection(
        prices,
        profitAndStopLossPercentLimit / 1.2,
        profitAndStopLossPercentLimit / 5,
        3
      );
      const priceDirectionShort = detectPriceDirection(
        last90MinsPrices,
        profitAndStopLossPercentLimit / 3,
        profitAndStopLossPercentLimit / 10,
        1
      );
      const prc = JSON.stringify({ tradePrice, askPrice, bidPrice });
      console.log("profitAndStopLossPercentLimit: ", profitAndStopLossPercentLimit);
      console.log("patternLong: ", patternLong);
      console.log("patternShort: ", patternShort);
      console.log("priceDirectionLong: ", priceDirectionLong);
      console.log("priceDirectionShort: ", priceDirectionShort);
      console.log("priceDirectionShort: ", this.breakdowns.at(-1) * 1.1 > this.breakdowns.at(-2));
      console.log("Prices: ", prc);

      // if (this.wasBreakdownPattern && pattern.includes("breakout")) {
      //   console.log("Pattern: ", priceDirection, priceDirection12, pattern, patternForLast24, prc);
      // }

      if (positions[0] && balance.crypto > 0) {
        // Todo, Sell when, DOWNTREND, DROPPING, position profit drops current profit percent / 5 or 4,
        // and the profit target is 1%, dynamic profit target from the drop percent, specific profit target defined by test of the last 3 days
        // The same for StopLoss limit
        const orderPriceChange = calcPercentageDifference(positions[0].price, bidPrice);
        const profitAndStopLossLimit = profitAndStopLossPercentLimit / 3;
        const loss = this.previousProfit - orderPriceChange;

        this.dispatch(
          "log",
          `Gain: ${this.previousProfit}% - Loss: ${loss}% - Current: ${orderPriceChange}% - previouslyDropped: ${this.previouslyDropped}%`
        );

        if (orderPriceChange > this.previousProfit) this.previousProfit = orderPriceChange;
        // else if (loss >= this.previousLoss) this.previousLoss = loss;
        // else {
        //   const recoveredPercent = this.previousLoss - loss;
        //   if (recoveredPercent > this.recoveredLoss) this.recoveredLoss = recoveredPercent;
        // }

        // safeAskBidSpread
        //

        // const droppedAfterLoss = loss - (this.previousLoss - this.recoveredLoss);

        const takeProfit = orderPriceChange > profitAndStopLossLimit / 3 && loss >= this.previousProfit / 5;

        const stopLoss =
          loss > profitAndStopLossLimit ||
          (loss >= profitAndStopLossPercentLimit / 3 && orderPriceChange < 0);
        // (isOlderThan(positions[0].createdAt, 48) && orderPriceChange < 0);
        // && this.recoveredLoss >= this.previousLoss / 4 && droppedAfterLoss > this.recoveredLoss / 5;

        if (takeProfit || stopLoss) {
          const orderType = stopLoss ? "stopLoss" : "profitable";
          this.dispatch("LOG", `Placing ${orderType} order ${prc}`);

          await this.sell(positions[0], balance.crypto, bidPrice);
          this.previousProfit = 0;
          // this.previousLoss = 0;
          // this.recoveredLoss = 0;
          this.previouslyDropped = 0;
        }
      } else if (!positions[0] && safeAskBidSpread && this.capital > 0 && balance.eur >= 5) {
        // Buy
        // this.dispatch("LOG", `shouldBuy: ${safeArea} - ${this.previouslyDropped} - ${shouldBuy}`);

        // Safety check: Make sure there is no spike higher then 10% and the current price is not lower then -10% then the highest price including "x% increase"
        // const sortedPrices = (allPrices.slice(-144).map((p) => p.askPrice) || []).toSorted((a, b) => a - b); //last 12 hrs
        // const safeArea =
        //   calcPercentageDifference(sortedPrices.at(0), bidPrice) <=
        //   Math.max(10, this.pricePercentChange * 1.5);

        // last90MinsPrices
        // priceChangePercent / 5
        // const mountainPercent = priceChangePercent / 12;
        // const mountainPercents = mountainPercent / 2;

        const highestBidPr = bidPrices.toSorted((a, b) => a - b).at(-1);
        this.previouslyDropped = -calcPercentageDifference(highestBidPr, askPrice);
        prices;

        const priceMovement12Hours = detectPriceDirection(prices, 4, 1, 2);
        const priceMovement = detectPriceDirection(
          last90MinsPrices,
          this.previouslyDropped / 4,
          this.previouslyDropped / 4,
          2
        );

        if (priceMovement12Hours == "UNKNOWN" && priceMovement == "UPTREND" && this.previouslyDropped > 2) {
          this.dispatch("LOG", `Placing BUY at ${askPrice} ${prc}`);
          const capital = balance.eur < this.capital ? balance.eur : this.capital;
          const cost = capital - calculateFee(capital, 0.4);
          const investingVolume = +(cost / askPrice).toFixed(8);
          const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
          this.dispatch("BUY", orderId);
        } else {
          this.dispatch("LOG", `Waiting for UPTREND signal`);
        }
      }

      this.dispatch("LOG", "");

      // this.wasBreakdownPattern = pattern.includes("breakdown");
    }
  }
}

module.exports = SwingTrader;
