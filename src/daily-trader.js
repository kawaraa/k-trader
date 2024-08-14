/*
How DailyTrader works:
DailyTrader performs a strategy based on the provided settings. It analyzes the prices of the last xxx days on every xxx mins interval. It buys if the average price drops -1.1% and the RSI is less than 30, and sell when the RSI is higher than 70 and the current price is xxx% higher than the bought order price.

Recommendation:
- if it's daily trading strategy, buy when the current price is 1.5% lower than any price in the last 3 hours
- if it's monthly trading strategy, buy when the current price is 1.5% lower than the average price in the last 4 or 5 days

Note: this is how orders are managed.
1- Check if there are buy order ID in state that has not been fulfilled, remove it from the state,
2- If fulfilled buy orders have fulfilled sell order, calculate the profits and remove these orders from the state
3- If it's good time to buy, place buy orders with 2 mins expire and store their IDs in the state.
4- If it's a good time to sell, place sell order with 2 mins expire and store it's ID in state with its buy order ID,
*/

const analyzer = require("./trend-analysis.js");
// Smart trader
module.exports = class DailyTrader {
  #pair;
  #capital;
  #investingCapital;
  #pricePercentageThreshold;
  #tradingAmount;
  constructor(exProvider, pair, { capital, investment, priceChange, strategyRange }) {
    this.ex = exProvider;
    this.#pair = pair;
    this.#capital = capital;
    this.#investingCapital = investment; // investing Amount in ERU that will be used every time to by crypto
    this.#pricePercentageThreshold = priceChange; // Percentage Change
    this.#tradingAmount = 0; // cryptoTradingAmount
    this.strategyRange = Math.max(+strategyRange || 0, 0.25); // Range in days "0.25 = 6 hours"
    this.listener = null;
  }
  async start(period) {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const currentPrice = await this.ex.currentPrice(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.strategyRange); // For the last xxx days
      const { stateOrders, orders } = await this.ex.getOrders(this.#pair);
      const fulfilledBuyOrders = [];

      for (const ids of stateOrders) {
        const [buyId, sellId] = ids.split("::");
        const buyOrder = orders.find((o) => o.id == buyId);

        if (buyOrder.status == "canceled") this.dispatch("cancelOrder", buyOrder.id);
        else {
          const sellOrder = orders.find((o) => o.id == sellId);

          if (!sellOrder || sellOrder.status != "closed") fulfilledBuyOrders.push(buyOrder);
          else {
            const profit = +(sellOrder.cost - buyOrder.cost).toFixed(2);
            this.dispatch("earnings", profit);
            this.dispatch("sell", buyId);
          }
        }
      }

      this.#tradingAmount = +(this.#investingCapital / currentPrice).toFixed(8);
      const rsi = analyzer.calculateRSI(prices);
      const averagePrice = analyzer.calculateAveragePrice(prices);
      const percentageChange = analyzer.calculatePercentageChange(currentPrice, averagePrice);
      const name = this.#pair.replace("EUR", "").toLowerCase();

      this.dispatch("currentPrice", currentPrice);
      this.dispatch("priceChange", percentageChange);
      this.dispatch("balance", balance.crypto);
      this.dispatch("log", `💰=> eur: ${balance.eur} <|> ${name}: ${balance.crypto}`);
      this.dispatch(
        "log",
        `RSI: ${rsi} => Change: ${percentageChange}% - Current: ${currentPrice} - Average: ${averagePrice}`
      );

      if (rsi < 30 && percentageChange < -1.2) {
        this.dispatch("log", `Suggest buying`);

        const totalInvestedAmount =
          fulfilledBuyOrders.reduce((acc, o) => acc + o.cost, 0) + this.#investingCapital;
        const remaining = +(Math.min(this.#investingCapital, balance.eur) / currentPrice).toFixed(8);

        if (balance.eur > 0 && totalInvestedAmount < this.#capital && remaining > this.#tradingAmount / 2) {
          const orderId = await this.ex.createOrder("buy", "limit", this.#pair, remaining, currentPrice);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Placed new buy order: "${orderId}"`);
        }
        //
      } else if (70 < rsi) {
        this.dispatch("log", `Suggest selling`);
        if (balance.crypto > 0) {
          for (const { id, volume, price } of fulfilledBuyOrders) {
            // Place sell order If the order price is xxx% lower than the current price
            if (this.#pricePercentageThreshold <= analyzer.calculatePercentageChange(currentPrice, price)) {
              const amount = Math.min(+volume, balance.crypto);
              const sellId = await this.ex.createOrder("sell", "limit", this.#pair, amount, currentPrice);
              this.dispatch("buy", `${id}::${sellId}`); // Update the buy order
              this.dispatch("log", `Placed new sell order: "${id}"`);
            }
          }
        }
      }

      this.dispatch("log", "");
    } catch (error) {
      this.dispatch("log", `Error running bot: ${error}`);
    }

    if (period) {
      this.timeoutID = setTimeout(() => this.start(period), 60000 * (Math.round(Math.random() * 3) + period));
    }
  }
  stop() {
    clearTimeout(this.timeoutID);
  }
  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }
};
