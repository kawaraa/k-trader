/*
===> Todo: update the following:

How DailyTrader works:
- DailyTrader performs a strategy based on the provided settings. It analyzes the prices of the last xxx days on every xxx mins interval. It buys if the average price drops -1.1% and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.
Recommendation:
- if it's daily trading strategy, buy when the current price is 1.5% lower than any price in the last 3 hours
- if it's monthly trading strategy, buy when the current price is 1.5% lower than the average price in the last 4 or 5 days
Note: this is how orders are managed.
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
  #percentageThreshold;
  #tradingAmount;
  #mode;
  constructor(exProvider, pair, { capital, investment, priceChange, strategyRange, mode }) {
    this.ex = exProvider;
    this.#pair = pair;
    this.#capital = capital;
    this.#investingCapital = investment; // investing Amount in ERU that will be used every time to by crypto
    this.#percentageThreshold = priceChange; // Percentage Change is the price Percentage Threshold
    this.#tradingAmount = 0; // cryptoTradingAmount
    this.strategyRange = Math.max(+strategyRange || 0, 0.25); // Range in days "0.25 = 6 hours"
    this.#mode = mode;
    this.listener = null;
  }

  async start(period) {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.strategyRange); // For the last xxx days
      this.#tradingAmount = +(this.#investingCapital / bidPrice).toFixed(8);

      const name = this.#pair.replace("EUR", "");
      const askPrices = prices.map((p) => p.askPrice);
      const bidPrices = prices.map((p) => p.bidPrice);
      const orders = await this.ex.getOrders(this.#pair);
      const askPriceRsi = calculateRSI(askPrices);
      const bidPriceRsi = calculateRSI(bidPrices);
      const avgAskPrice = calcAveragePrice(askPrices);
      const avgBidPrice = calcAveragePrice(bidPrices);
      const askPercentageChange = calcPercentageDifference(avgAskPrice, askPrice);
      const bidPercentageChange = calcPercentageDifference(avgBidPrice, bidPrice);
      const highestBidPr = bidPrices.toSorted().at(-1);
      const totalInvestedAmount = orders.reduce((acc, o) => acc + o.cost, 0) + this.#investingCapital;

      this.dispatch("balance", balance.crypto);
      this.dispatch("log", `💰 EUR: ${balance.eur} <|> ${name}: ${balance.crypto} - Price: ${tradePrice}`);
      this.dispatch(
        "log",
        `Ask Price: => RSI: ${askPriceRsi} - Cur: ${askPrice} Avg: ${avgAskPrice}% Chg: ${askPercentageChange}%`
      );
      this.dispatch(
        "log",
        `Bid Price: => RSI: ${bidPriceRsi} - Cur: ${bidPrice} Avg: ${avgBidPrice}% Chg: ${bidPercentageChange}%`
      );
      // 💰 📊

      // high-drop
      let shouldBuy = calcPercentageDifference(highestBidPr, askPrice) < -(this.#percentageThreshold * 1.2);

      if (this.#mode.includes("near-low")) {
        const lowestAsk = askPrices.toSorted()[0];
        shouldBuy = calcPercentageDifference(lowestAsk, askPrice) < this.#percentageThreshold / 8;

        if (shouldBuy && this.#capital <= totalInvestedAmount + this.#investingCapital * 2) {
          const order = orders.find((o) => 0.5 <= calcPercentageDifference(o.price, bidPrice));
          if (order) await this.#sell(order, balance.crypto, bidPrice);
        }
      }

      if (this.#mode.includes("partly-trade")) {
        // Pause buying if the bidPrice is higher then price of the last Order In the first or second Part
        const thirdIndex = Math.round(this.#capital / this.#investingCapital / 3);
        const { price } = orders[thirdIndex * 2 - 1] || orders[thirdIndex - 1] || {};
        if (price && -(this.#percentageThreshold / 2) < calcPercentageDifference(price, bidPrice)) {
          shouldBuy = false;
        }
      }

      if (prices.length >= (this.strategyRange * 24 * 60) / 5 && shouldBuy) {
        this.dispatch("log", `Suggest buying: Lowest Ask Price is ${askPrices.toSorted()[0]}`);

        const remaining = +(Math.min(this.#investingCapital, balance.eur) / askPrice).toFixed(8);

        if (balance.eur > 0 && totalInvestedAmount < this.#capital && remaining > this.#tradingAmount / 2) {
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, remaining);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}"`);
        }
      } else if (70 <= bidPriceRsi && balance.crypto > 0 && orders[0]) {
        for (const { id, price, volume, cost, createdAt } of orders) {
          const sell = this.#percentageThreshold <= calcPercentageDifference(price, bidPrice);
          // Backlog: Sell accumulated orders that has been more than 5 days if the current price is higher then highest price in the lest 4 hours.
          // Todo: add the this for live || isOlderThen(createdAt, 20)
          if (sell) await this.#sell({ id, volume, cost, price }, balance.crypto, bidPrice);
        }
      }

      this.dispatch("log", "");
    } catch (error) {
      // console.log(`Error running bot: ${error}`);
      this.dispatch("log", `Error running bot: ${error}`);
    }

    if (period) {
      this.timeoutID = setTimeout(() => this.start(period), Math.round(60000 * (Math.random() * 3 + period)));
    }
  }

  async #sell({ id, volume, cost, price }, cryptoBalance, bidPrice) {
    const amount = Math.min(+volume, cryptoBalance);
    const orderId = await this.ex.createOrder("sell", "market", this.#pair, amount);
    const c = bidPrice * amount + calculateFee(bidPrice * amount, 0.4);
    const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - cost).toFixed(2);
    this.dispatch("sell", id);
    this.dispatch("earnings", profit);
    this.dispatch("log", `Sold crypto with profit: ${profit} - ID: "${id}"`);
    // console.log("Profit: => ", profit, "Prices: ", price, bidPrice);
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
