/*
This strategy based on 5 to 8 mins interval and checking the last 4 hours on every 5 mins change.
Recommendation:
- if it's daily trading strategy, buy when the current price is 1.5% lower then any price in the last 4 hours
- if it's monthly trading strategy, buy when the current price is 1.5% lower then the average price in the last 5 days
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
      this.#tradingAmount = +(this.#investingCapital / currentPrice).toFixed(8);

      const orders = await this.ex.getOrders(this.#pair);
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

        const totalInvestedAmount = orders.reduce((acc, o) => acc + o.cost, 0) + this.#investingCapital;
        this.dispatch("log", `TotalInvestedAmount: "${totalInvestedAmount}"`); // Test
        const remaining = +(Math.min(this.#investingCapital, balance.eur) / currentPrice).toFixed(8);
        this.dispatch("log", `Remaining: "${remaining}"`); // Test

        if (balance.eur > 0 && totalInvestedAmount < this.#capital && remaining > this.#tradingAmount / 2) {
          this.dispatch("log", `OrderInfo: "${this.#pair}"`); // Test

          const orderId = await this.ex.createOrder("buy", "market", this.#pair, remaining);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}"`);
        }
        //
      } else if (70 < rsi) {
        this.dispatch("log", `Suggest selling`);

        // Get Orders that have price Lower Than the Current Price
        const ordersForSell = orders.filter(
          (o) => this.#pricePercentageThreshold <= analyzer.calculatePercentageChange(currentPrice, +o.price)
        );

        if (balance.crypto > 0 && ordersForSell[0]) {
          for (const { id, volume, price } of ordersForSell) {
            await this.ex.createOrder("sell", "market", this.#pair, Math.min(+volume, balance.crypto));
            const profit = analyzer.calculateProfit(currentPrice, +price, +volume, 0.4);
            this.dispatch("sell", id);
            this.dispatch("earnings", +profit.toFixed(2));
            this.dispatch("log", `Sold crypto with profit: ${profit} - ID: "${id}"`);
          }
        }
      }

      this.dispatch("log", "");
    } catch (error) {
      console.log(`Error running bot: ${error}`);
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
