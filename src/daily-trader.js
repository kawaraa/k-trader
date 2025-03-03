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
  calcPercentageDifference,
  calculateFee,
  isOlderThen,
  calcAveragePrice,
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
    this.buySellOnThreshold = this.#percentageThreshold / 4;
    this.liquidity = { history: [], average: 0 };

    this.previouslyDropped = false;
    this.previousProfit = 0;
  }

  async start() {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.#strategyRange); // For the last xxx days
      const orders = await this.ex.getOrders(this.#pair);

      const enoughPricesData = prices.length >= (this.#strategyRange * 60) / this.timeInterval;
      const bidPrices = prices.map((p) => p.bidPrice);
      const highestBidPr = bidPrices.sort().at(-1);

      const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);
      if (!enoughPricesData) this.liquidity.history.push(askBidSpreadPercentage);
      else if (!this.liquidity.average) this.liquidity.average = calcAveragePrice(this.liquidity.history);
      const shouldTrade = enoughPricesData && askBidSpreadPercentage <= this.liquidity.average;

      const highDropChange = calcPercentageDifference(highestBidPr, askPrice);
      const dropped = highDropChange < -this.#percentageThreshold;
      const goingUp = this.#findPriceMovement(prices, this.buySellOnThreshold) == "increasing";
      let shouldBuy = false;

      if (!this.previouslyDropped && dropped) this.previouslyDropped = true;

      // 1. On price drop mode "on-drop"
      if (this.mode.includes("on-drop")) shouldBuy = dropped && goingUp;
      // 2. On price decrease mode "on-decrease"
      else if (this.mode.includes("on-decrease")) shouldBuy = this.previouslyDropped && goingUp;

      const log = `Suggest buying: ${shouldTrade && shouldBuy}`;
      this.dispatch("log", `${log} - Prices => Trade: ${tradePrice} - Ask: ${askPrice} - Bid: ${bidPrice}`);

      // Buy
      if (shouldTrade && shouldBuy) {
        if (!orders[0] && this.#capital > 0 && balance.eur >= this.#capital / 2) {
          const capital = balance.eur < this.#capital ? balance.eur : this.#capital;
          const cost = capital - calculateFee(capital, 0.4);
          const investingVolume = +(cost / askPrice).toFixed(8);
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, investingVolume);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}" at ask Price above 👆`);
        }

        // Sell
      } else if (shouldTrade && balance.crypto > 0 && orders[0]) {
        let orderType = "profitable";
        let order = orders[0];

        const halfThreshold = this.#percentageThreshold / 2;
        const priceChange = calcPercentageDifference(order.price, bidPrice);

        if (priceChange > this.previousProfit) this.previousProfit = priceChange;

        const dropping =
          this.previousProfit > 0 && priceChange - this.previousProfit <= -this.buySellOnThreshold;
        // const noLossPeriod = isOlderThen(order.createdAt, this.#strategyRange * 2) && priceChange > 0;
        // const stopLossPeriod1 = isOlderThen(order.createdAt, this.#strategyRange * 3);
        // const stopLossPeriod2 = isOlderThen(order.createdAt, this.#strategyRange * 3.5);

        const stopLossPeriod = isOlderThen(order.createdAt, this.#strategyRange * 3);
        const shouldSell = (dropping || !goingUp) && (priceChange > halfThreshold || stopLossPeriod);

        // const shouldSell =
        //   ((dropping || !goingUp) && (priceChange > halfThreshold || noLossPeriod || stopLossPeriod1)) ||
        //   stopLossPeriod2;
        const stopLossLimit =
          (this.previousProfit >= this.buySellOnThreshold && priceChange <= 0) ||
          priceChange <= -this.#percentageThreshold;

        // if (stopLossLimit) orderType = "stopLossLimit";
        // else if (noLossPeriod) orderType = "noLossPeriod"; // earlySelling
        // else if (stopLossPeriod1) orderType = "stopLossPeriod1";
        // else if (stopLossPeriod2) orderType = "stopLossPeriod2";

        if (stopLossLimit) orderType = "stopLossLimit";
        else if (stopLossPeriod) orderType = "stopLossPeriod";

        // Backlog order: If older then stopLossPeriod or when the price drop percentageThreshold, Sell accumulated orders that has been more than xxx days if the current price is higher then highest price in the lest xxx hours.

        if (!shouldSell && !stopLossLimit && !stopLossPeriod) order = null;
        else this.dispatch("log", `${orderType} order will be executed`);

        if (order) {
          await this.#sell(order, balance.crypto, bidPrice);
          this.previousProfit = 0;
        }
      }

      if (shouldBuy) this.previouslyDropped = false;
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

  #findPriceMovement(prices, minPercent) {
    const length = prices.length - 2;
    let latest = prices.at(-2);
    let lowest = latest;

    for (let i = length; i > 0; i--) {
      const previous = prices[i + 1];
      const current = prices[i];
      if (current.askPrice <= previous.askPrice) lowest = current;

      if (calcPercentageDifference(lowest.askPrice, latest.askPrice) >= minPercent) return "increasing";
      else if (calcPercentageDifference(current.askPrice, latest.askPrice) <= -minPercent) return "dropping";
    }
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
