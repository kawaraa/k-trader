/*

===> How DailyTrader works <===

- DailyTrader performs trading based on the provided strategy and settings. It analyzes the prices of the last xxx days on every xxx mins interval. every strategy has its settings.

- There are a currently 5 strategies:
1. high-drop: It buys if the current price drops -xxx% and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
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
  #investingCapital;
  #strategyRange;
  #percentageThreshold;
  #tradingAmount;
  constructor(exProvider, pair, { capital, investment, strategyRange, priceChange, mode, timeInterval }) {
    this.ex = exProvider;
    this.#pair = pair;
    this.#capital = capital;
    this.#investingCapital = investment; // investing Amount in ERU that will be used every time to by crypto
    this.#strategyRange = Math.max(+strategyRange || 0, 0.25); // Range in days "0.25 = 6 hours"
    this.#percentageThreshold = priceChange; // Percentage Change is the price Percentage Threshold
    this.mode = mode;
    this.period = +timeInterval;
    this.#tradingAmount = 0; // cryptoTradingAmount
    this.lowRSI = mode?.includes("hard") ? 30 : 45;
    this.highRSI = mode?.includes("hard") ? 85 : 80;
    this.listener = null;
    this.previousLowBidRSI = null;
    this.previousHighBidRSI = null;
  }

  async start() {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.#strategyRange); // For the last xxx days
      this.#tradingAmount = +(this.#investingCapital / bidPrice).toFixed(8);

      const name = this.#pair.replace("EUR", "");
      const askPrices = prices.map((p) => p.askPrice);
      const bidPrices = prices.map((p) => p.bidPrice);
      const orders = await this.ex.getOrders(this.#pair);
      const askPriceRSI = calculateRSI(askPrices);
      const bidPriceRSI = calculateRSI(bidPrices);
      const avgAskPrice = calcAveragePrice(askPrices);
      const avgBidPrice = calcAveragePrice(bidPrices);
      const askPercentageChange = calcPercentageDifference(avgAskPrice, askPrice);
      const bidPercentageChange = calcPercentageDifference(avgBidPrice, bidPrice);
      const highestBidPr = bidPrices.sort().at(-1);
      const lowestAsk = askPrices.sort()[0];
      const orderLimit = parseInt(this.#capital / this.#investingCapital) - 1;
      const interval = this.period || this.timeInterval; // this.timeInterval is used only in test trading
      const enoughPricesData = prices.length >= (this.#strategyRange * 24 * 60) / interval;
      const partlyTrade = this.#investingCapital != this.#capital;

      this.dispatch("balance", balance.crypto);
      this.dispatch("log", `💰 EUR: ${balance.eur} <|> ${name}: ${balance.crypto} - Price: ${tradePrice}`);
      this.dispatch(
        "log",
        `Ask Price: => RSI: ${askPriceRSI} - Cur: ${askPrice} Avg: ${avgAskPrice}% Chg: ${askPercentageChange}%`
      );
      this.dispatch(
        "log",
        `Bid Price: => RSI: ${bidPriceRSI} - Cur: ${bidPrice} Avg: ${avgBidPrice}% Chg: ${bidPercentageChange}%`
      );

      // 1. On price drop mode
      const HighDropChange = calcPercentageDifference(highestBidPr, askPrice);
      let shouldBuy = HighDropChange < -(this.#percentageThreshold * 1.2);

      // 2. On price increase mode
      if (this.mode.includes("on-increase")) {
        shouldBuy = shouldBuy && this.previousLowBidRSI <= bidPriceRSI;
        this.previousLowBidRSI = bidPriceRSI;
      }

      // 3. On price reach lowest price mode
      if (this.mode.includes("near-low")) {
        const nearLow = calcPercentageDifference(lowestAsk, askPrice);
        shouldBuy = HighDropChange <= -this.#percentageThreshold && nearLow < this.#percentageThreshold / 8;
      }

      // 4. Pause buying if the bidPrice is higher then price of the last Order In the first or second Part
      if (partlyTrade) {
        const thirdIndex = Math.round((orderLimit + 1) / 3);
        const { price } = orders[thirdIndex * 2 - 1] || orders[thirdIndex - 1] || {};
        const threshold = -Math.max(this.#percentageThreshold / 2, 1.5);

        if (price && threshold < calcPercentageDifference(price, bidPrice)) shouldBuy = false;
      } else {
        // 5. Safety check, pause buying if the price is dropping too much or fast
        if (HighDropChange <= -(this.#percentageThreshold * 1.5)) shouldBuy = false;
      }

      // Buy
      if (enoughPricesData && shouldBuy && askPriceRSI < this.lowRSI) {
        this.dispatch("log", `Suggest buying: Lowest Ask Price is ${lowestAsk}`);

        if (!orders[orderLimit] && balance.eur >= this.#investingCapital) {
          const cost = this.#investingCapital - calculateFee(this.#investingCapital, 0.4);
          const investingVolume = +(cost / askPrice).toFixed(8);
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, investingVolume);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}"`);
        }

        // Sell
      } else if (60 < bidPriceRSI && balance.crypto > 0 && orders[0]) {
        this.dispatch("log", `Suggest selling orders`);
        let sellableOrders = orders.filter((o) => {
          return this.#percentageThreshold <= calcPercentageDifference(o.price, bidPrice);
        });

        const goingDown = this.highRSI < bidPriceRSI && this.previousHighBidRSI >= bidPriceRSI;
        this.previousHighBidRSI = bidPriceRSI;

        if (!sellableOrders[0] && orders[orderLimit] && goingDown) {
          // Backlog: Sell accumulated orders that has been more than xxx days if the current price is higher then highest price in the lest xxx hours.
          sellableOrders = orders.filter((o) => isOlderThen(o.createdAt, 4.5)); // 5, 6
          this.dispatch("log", `There are (${sellableOrders.length}) backlog orders`);
        } else {
          this.dispatch("log", `There are (${sellableOrders.length}) sellable orders`);
        }

        for (const order of sellableOrders) {
          await this.#sell(order, balance.crypto, bidPrice);
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
    const orderAge = ((Date.now() - createdAt) / 60000 / 60 / 24).toFixed(1);
    this.dispatch("sell", id);
    this.dispatch("earnings", profit);
    this.dispatch("log", `Sold crypto with profit: ${profit} - Age: ${orderAge} - ID: "${id}"`);
  }

  async sellAll() {
    const cryptoBalance = (await this.ex.balance(this.#pair)).crypto;
    const orders = await this.ex.getOrders(this.#pair);
    const bidPrice = (await this.ex.currentPrices(this.#pair)).bidPrice;
    const orderId = await this.ex.createOrder("sell", "market", this.#pair, cryptoBalance);
    const c = bidPrice * cryptoBalance - calculateFee(bidPrice * cryptoBalance, 0.4);
    const ordersCost = orders.reduce((totalCost, { cost }) => totalCost + cost, 0);
    const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - ordersCost).toFixed(2);

    this.dispatch("earnings", profit);
    this.dispatch("log", `Sold all crypto asset with profit: ${profit}`);
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
