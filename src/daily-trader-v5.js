/*

===> How DailyTrader works <===

- DailyTrader performs trading based on the provided strategy and settings. It analyzes the prices of the last xxx days on every xxx mins interval. every strategy has its settings.

- There are a currently 5 strategies:
1. on-drop: It buys if the current price drops -xxx% and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
3. near-low: It buys if the current price drops -xxx% and near the lowest price in the last xxx days and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
5. on-increase: It buys if the RSI is less than 30 and increasing, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.

- Settings: are used to control whether it's a long term strategy or short term trading / daily trading strategy, you can set it up using the "strategy range" field. if it's a day or less then obviously it's a short term trading strategy. 

- Note: this is how limit orders are managed:
1. Check if there are buy order ID in state that has not been fulfilled, remove it from the state,
2. If fulfilled buy orders have fulfilled sell order, calculate the profits and remove these orders from the state
3. If it's good time to buy, place buy orders with 2 mins expire and store their IDs in the state.
4. If it's a good time to sell, place sell order with 2 mins expire and store it's ID in state with its buy order ID,
*/

const {
  calculateRSI,
  calcAveragePrice,
  calcPercentageDifference,
  calculateFee,
  isOlderThen,
} = require("./trend-analysis.js");

// Smart trader
module.exports = class DailyTrader {
  #pair;
  #capital;
  #strategyRange;
  #percentageThreshold;
  constructor(exProvider, pair, { capital, strategyRange, priceChange, mode, timeInterval }) {
    this.ex = exProvider;
    this.#pair = pair;
    this.#capital = capital; // Investment cptl investing Amount in ERU that will be used every time to by crypto
    this.#strategyRange = Math.max(+strategyRange || 0, 0.5); // Range in hours "0.5 = have an hour"
    this.#percentageThreshold = Math.max(+priceChange || 0, 1.5); // Percentage Change is the price Percentage Threshold
    this.mode = mode;
    this.timeInterval = +timeInterval;
    this.period = +timeInterval; // this.period is deleted in only test trading
    this.listener = null;
    this.buyOnRSI = 30;
    this.buySellThreshold = this.#percentageThreshold / 4;

    this.previouslyDropped = false;
    this.previousBidRSI = null;
    this.previousProfit = 0;
    this.previousLoss = 0;
  }

  async start() {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.#strategyRange); // For the last xxx days
      const period = Math.max(prices.length / 5, 6);
      const askPrices = prices.map((p) => p.askPrice);
      const bidPrices = prices.map((p) => p.bidPrice);
      const orders = await this.ex.getOrders(this.#pair);
      const askPriceRSI = calculateRSI(askPrices, period);
      const bidPriceRSI = calculateRSI(bidPrices, period);
      const avgAskPrice = calcAveragePrice(askPrices);
      const avgBidPrice = calcAveragePrice(bidPrices);
      const askPrChange = calcPercentageDifference(avgAskPrice, askPrice);
      const bidPrChange = calcPercentageDifference(avgBidPrice, bidPrice);
      const highestBidPr = bidPrices.sort().at(-1);
      const lowestAsk = askPrices.sort()[0];
      const enoughPricesData = prices.length >= (this.#strategyRange * 60) / this.timeInterval;

      const multiplier = this.#percentageThreshold < 5 ? 5 : 6;
      const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);
      const highLiquidity = askBidSpreadPercentage < this.#percentageThreshold / multiplier;

      const highDropChange = calcPercentageDifference(highestBidPr, askPrice);
      const increased = calcPercentageDifference(lowestAsk, askPrice);
      const dropped = highDropChange < -(this.#percentageThreshold * 1.2);
      const goingUp = increased >= this.buySellThreshold;
      const rsiGoingUp = askPriceRSI <= this.buyOnRSI && this.previousBidRSI < bidPriceRSI;
      let shouldBuy = false;

      if (!this.previouslyDropped && dropped) this.previouslyDropped = true;

      this.dispatch("log", `Ask Price: => Cur:${askPrice} - RSI:${askPriceRSI} Change:${askPrChange}%`);
      this.dispatch("log", `Bid Price: => Cur:${bidPrice} - RSI:${bidPriceRSI} Change:${bidPrChange}%`);

      // 1. On price drop mode "on-drop"
      if (this.mode.includes("on-drop")) {
        shouldBuy = dropped && rsiGoingUp;
        if (this.mode.includes("percent")) shouldBuy = dropped && goingUp;

        // 2. On price decrease mode "on-decrease"
      } else if (this.mode.includes("on-decrease")) {
        shouldBuy = this.previouslyDropped && rsiGoingUp;
        if (this.mode.includes("percent")) shouldBuy = this.previouslyDropped && goingUp;
      }

      // Buy
      if (enoughPricesData && highLiquidity && shouldBuy) {
        this.dispatch("log", `Suggest buying: TradePrice Price is ${tradePrice}`);

        if (!orders[0] && this.#capital > 0 && balance.eur >= this.#capital / 2) {
          const capital = balance.eur < this.#capital ? balance.eur : this.#capital;
          const cost = capital - calculateFee(capital, 0.4);
          const investingVolume = +(cost / askPrice).toFixed(8);
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, investingVolume);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}" at ask Price above 👆`);
        }

        // Sell
      } else if (enoughPricesData && balance.crypto > 0 && orders[0]) {
        let orderType = "";
        let order = orders[0];

        const halfThreshold = this.#percentageThreshold / 2;
        const safetyThreshold = -(this.#percentageThreshold / 3);
        const priceChange = calcPercentageDifference(order.price, bidPrice);
        const increasedByHalf = increased >= halfThreshold;
        const rsi = this.mode.includes("rsi");

        if (priceChange > this.previousProfit) this.previousProfit = priceChange;
        else if (priceChange < this.previousLoss) this.previousLoss = priceChange;

        const dropping =
          this.previousProfit > 0 && priceChange - this.previousProfit <= -this.buySellThreshold;
        const goingDown = !rsi && !dropped && highDropChange <= -this.buySellThreshold;
        const droppingHard = this.previousProfit > 0 && priceChange - this.previousProfit <= -safetyThreshold;
        const goingDownHard = !dropped && highDropChange <= -safetyThreshold;
        const rsiGoingDown = rsi && this.previousBidRSI > 70 && this.previousBidRSI > bidPriceRSI;
        const hasBeen24 = isOlderThen(order.createdAt, Math.max(this.#strategyRange * 3, 24));
        const stopLossPeriod = isOlderThen(order.createdAt, 24 * 2);

        const profitable =
          ((dropping || goingDown || rsiGoingDown) && priceChange >= this.#percentageThreshold) ||
          ((droppingHard || goingDownHard || hasBeen24) && priceChange >= halfThreshold);
        // this.previousProfit >= halfThreshold

        const stopLoss =
          (this.previousProfit > this.buySellThreshold && priceChange < this.buySellThreshold) ||
          (this.previousLoss < -halfThreshold && increasedByHalf) ||
          (stopLossPeriod && increasedByHalf);

        if (stopLoss) orderType = "stopLoss";
        // Backlog order: If older then StopLossLimit, Sell accumulated orders that has been more than xxx days if the current price is higher then highest price in the lest xxx hours.

        if (!profitable && !stopLoss) order = null;
        else this.dispatch("log", `${orderType} order will be executed`);

        if (order) {
          await this.#sell(order, balance.crypto, bidPrice);
          this.previousProfit = 0;
          this.previousLoss = 0;
        }
      }

      if (shouldBuy) this.previouslyDropped = false;
      this.previousBidRSI = bidPriceRSI;
      this.dispatch("log", "");
    } catch (error) {
      this.dispatch("log", `Error running bot: ${error}`);
    }

    if (this.period) this.timeoutID = setTimeout(() => this.start(), 60000 * this.period);
  }

  async #sell({ id, volume, cost, price, createdAt }, cryptoBalance, bidPrice) {
    const amount = bidPrice * (cryptoBalance - volume) < 5 ? cryptoBalance : volume;
    const orderId = await this.ex.createOrder("sell", "market", this.#pair, amount);
    const c = bidPrice * amount - calculateFee(bidPrice * amount, 0.4);
    const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - cost).toFixed(2);
    const orderAge = ((Date.now() - createdAt) / 60000 / 60 / 24).toFixed(1);
    this.dispatch("sell", id);
    this.dispatch("earnings", profit);
    this.dispatch("log", `Sold crypto with profit: ${profit} - Age: ${orderAge} - ID: "${id}"`);
  }

  async sellAll() {
    const cryptoBalance = (await this.ex.balance(this.#pair)).crypto;
    if (cryptoBalance > 0) {
      const orders = await this.ex.getOrders(this.#pair);
      const bidPrice = (await this.ex.currentPrices(this.#pair)).bidPrice;
      const orderId = await this.ex.createOrder("sell", "market", this.#pair, cryptoBalance);
      const c = bidPrice * cryptoBalance - calculateFee(bidPrice * cryptoBalance, 0.4);
      const ordersCost = orders.reduce((totalCost, { cost }) => totalCost + cost, 0);
      const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - ordersCost).toFixed(2);

      this.dispatch("earnings", profit);
      this.dispatch("log", `Sold all crypto asset with profit: ${profit}`);
    }
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }
};

/*

// // ========== Prices Changes Tests ==========
// if (calcPercentageDifference(highestBidPr, askPrice) < -(this.#percentageThreshold * 2)) {
//   console.log("Should Buy:", askPrice, calcPercentageDifference(highestBidPr, askPrice)); // Buy
//   this.lastPrice = askPrice;
// } else if (
//   this.lastPrice &&
//   calcPercentageDifference(this.lastPrice, bidPrice) > this.#percentageThreshold
// ) {
//   console.log("Should Sell:", bidPrice, calcPercentageDifference(this.lastPrice, bidPrice)); // Sell
//   if (!this.profit) this.profit = 0;
//   this.profit += bidPrice - this.lastPrice;
//   this.lastPrice = bidPrice;
//   console.log("profit", this.profit);
// }

*/
