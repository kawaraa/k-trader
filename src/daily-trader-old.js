/*

===> How DailyTrader works <===

- DailyTrader performs trading based on the provided strategy and settings. It analyzes the prices of the last xxx days on every xxx mins interval. every strategy has its settings.

- There are a currently 5 strategies:
1. ON-DROP: It buys if the current price drops -xxx% and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
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
  calcAveragePrice,
  detectPriceShape,
} = require("./trend-analysis.js");

// Smart trader
module.exports = class DailyTrader {
  #pair;
  #capital;
  #strategyRange;
  #pricePercentChangeThreshold;
  constructor(exProvider, pair, { capital, strategyRange, pricePercentChange, mode, timeInterval }) {
    this.ex = exProvider;
    this.#pair = pair;
    this.timeInterval = +timeInterval;
    this.#capital = capital; // Investment cptl investing Amount in ERU that will be used every time to by crypto
    const strategySettings = info.strategy.split(":");
    this.mode = strategySettings[0];
    this.#strategyRange = Math.max(+strategySettings[1] || 0, 0.5); // Range in hours "0.5 = have an hour"
    this.#pricePercentChangeThreshold = Math.max(+strategySettings[2] || 0, 1.5); // Percentage Change is the price Percentage Threshold
    this.range = this.#strategyRange;
    this.percentage = this.#pricePercentChangeThreshold;
    this.buySellOnThreshold = this.#pricePercentChangeThreshold / 4;
    this.profitThreshold = this.#pricePercentChangeThreshold / 1.2;

    this.period = +timeInterval; // this.period is deleted in only test trading
    this.listener = null;

    this.previouslyDropped = false;
    this.previousProfit = 0;
    this.previousLoss = 0;
    this.averageAskBidSpread;
  }

  async start() {
    try {
      // Safety check starts
      this.range = this.#strategyRange;
      const trades = await this.ex.getState(this.#pair, "trades");
      const earningsPercentage = (trades.slice(-3).reduce((acc, n) => acc + n, 0) / this.#capital) * 100;
      if (earningsPercentage < -(this.#pricePercentChangeThreshold / 2)) this.range = this.#strategyRange / 2;
      if (earningsPercentage < -this.#pricePercentChangeThreshold) this.range = 1;
      // Safety check ends

      // Get data from Kraken
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.range); // For the last xxx days
      const orders = await this.ex.getOrders(this.#pair);

      const enoughPricesData = prices.length >= (this.range * 60) / this.timeInterval;
      const bidPrices = prices.map((p) => p.bidPrice);
      const priceShape = detectPriceShape(bidPrices, this.buySellOnThreshold).shape;
      const highestBidPr = bidPrices.sort().at(-1);
      const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);

      if (enoughPricesData && !this.averageAskBidSpread) {
        this.averageAskBidSpread = calcAveragePrice(
          prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
        );
      }

      const shouldTrade = enoughPricesData && askBidSpreadPercentage <= this.averageAskBidSpread;
      const dropped = calcPercentageDifference(highestBidPr, askPrice) < -this.percentage;
      const offset = this.mode.includes("ON-DROP") ? 0 : prices.length / 2;
      const priceMove = this.#findPriceMovement(prices, this.buySellOnThreshold, offset);
      const increasing = priceMove == "increasing";
      const dropping = priceMove == "dropping";
      const orderPriceChange = calcPercentageDifference(orders[0]?.price, bidPrice);
      const loss = this.previousProfit - orderPriceChange;
      let shouldBuy = false;

      if (!this.previouslyDropped && dropped) this.previouslyDropped = true;
      if (orderPriceChange > this.previousProfit) this.previousProfit = orderPriceChange;
      if (orderPriceChange < this.previousLoss) this.previousLoss = orderPriceChange;

      if (this.mode.includes("ON-DROP")) shouldBuy = dropped && increasing;
      else if (this.mode.includes("ON-DECREASE")) shouldBuy = this.previouslyDropped && increasing;
      else if (this.mode.includes("ON-V-SHAPE")) shouldBuy = priceShape == "V";

      const log = `Should buy: ${shouldBuy} - Should trade: ${shouldTrade}`;
      this.dispatch("log", `${log} - Prices => Trade: ${tradePrice} - Ask: ${askPrice} - Bid: ${bidPrice}`);
      if (orders[0]) {
        this.dispatch(
          "log",
          `Gain: ${this.previousProfit}% - Loss: ${this.previousLoss}% - Current: ${orderPriceChange}%`
        );
      }

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
        let order = orders[0];

        const goingDown =
          this.previousProfit > this.profitThreshold && (dropping || loss > this.buySellOnThreshold);
        const stopLoss = loss > this.#pricePercentChangeThreshold;

        if (!(goingDown || stopLoss)) order = null;
        else this.dispatch("log", `${stopLoss ? "stopLoss" : "profitable"} order will be executed`);

        if (order) {
          await this.#sell(order, balance.crypto, bidPrice);
          this.previousProfit = 0;
          this.previousLoss = 0;
          if (orderPriceChange > 0) this.previouslyDropped = false;
        }
      }

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
    const orderAge = ((Date.now() - createdAt) / 60000 / 60).toFixed(1);
    this.dispatch("sell", { id, profit });
    this.dispatch("log", `Sold crypto with profit: ${profit} - Age: ${orderAge}hrs - ID: "${id}"`);
  }

  async sellAll() {
    const cryptoBalance = (await this.ex.balance(this.#pair)).crypto;
    let profit = 0;
    if (cryptoBalance > 0) {
      const orders = await this.ex.getOrders(this.#pair);
      const bidPrice = (await this.ex.currentPrices(this.#pair)).bidPrice;
      const orderId = await this.ex.createOrder("sell", "market", this.#pair, cryptoBalance);
      const c = bidPrice * cryptoBalance - calculateFee(bidPrice * cryptoBalance, 0.4);
      const ordersCost = orders.reduce((totalCost, { cost }) => totalCost + cost, 0);
      profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - ordersCost).toFixed(2);
    }
    this.dispatch("sell", { profit });
    this.dispatch("log", `Sold all crypto asset with profit: ${profit}`);
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }

  #findPriceMovement(prices, minPercent, offset = 0) {
    const length = prices.length - 2;
    let latest = prices.at(-2);
    let lowest = latest;

    for (let i = length; i > offset; i--) {
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
// if (calcPercentageDifference(highestBidPr, askPrice) < -(this.percentage * 2)) {
//   console.log("Should Buy:", askPrice, calcPercentageDifference(highestBidPr, askPrice)); // Buy
//   this.lastPrice = askPrice;
// } else if (
//   this.lastPrice &&
//   calcPercentageDifference(this.lastPrice, bidPrice) > this.percentage
// ) {
//   console.log("Should Sell:", bidPrice, calcPercentageDifference(this.lastPrice, bidPrice)); // Sell
//   if (!this.profit) this.profit = 0;
//   this.profit += bidPrice - this.lastPrice;
//   this.lastPrice = bidPrice;
//   console.log("profit", this.profit);
// }

*/
