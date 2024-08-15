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
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.strategyRange); // For the last xxx days
      this.#tradingAmount = +(this.#investingCapital / tradePrice).toFixed(8);

      const orders = await this.ex.getOrders(this.#pair);
      const rsi = analyzer.calculateRSI(prices);
      const averagePrice = analyzer.calculateAveragePrice(prices);
      const percentageChange = analyzer.calculatePercentageChange(tradePrice, averagePrice);
      const askPercentageChange = analyzer.calculatePercentageChange(askPrice, averagePrice);
      const priceIsStable = this.#isPriceStable(prices);
      const name = this.#pair.replace("EUR", "").toLowerCase();

      this.dispatch("tradePrice", tradePrice);
      this.dispatch("priceChange", percentageChange);
      this.dispatch("balance", balance.crypto);
      this.dispatch("log", `💰=> eur: ${balance.eur} <|> ${name}: ${balance.crypto}`);
      this.dispatch(
        "log",
        `RSI: ${rsi} => Change: ${percentageChange}% - Current: ${tradePrice} - Average: ${averagePrice}`
      );

      if (rsi < 30 && askPercentageChange < -1.2 && priceIsStable) {
        this.dispatch("log", `Suggest buying`);

        const totalInvestedAmount = orders.reduce((acc, o) => acc + o.cost, 0) + this.#investingCapital;
        const remaining = +(Math.min(this.#investingCapital, balance.eur) / askPrice).toFixed(8);

        console.log("Testing buying", askPrice, this.#tradingAmount, totalInvestedAmount, remaining); // Testing

        if (balance.eur > 0 && totalInvestedAmount < this.#capital && remaining > this.#tradingAmount / 2) {
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, remaining);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}"`);
        }
        //
      } else if (70 < rsi && priceIsStable) {
        this.dispatch("log", `Suggest selling`);

        if (balance.crypto > 0 && orders[0]) {
          for (const { id, price, volume, cost } of orders) {
            if (this.#pricePercentageThreshold <= analyzer.calculatePercentageChange(bidPrice, price)) {
              const amount = Math.min(+volume, balance.crypto);
              const orderId = await this.ex.createOrder("sell", "market", this.#pair, amount);
              const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || cost) - cost).toFixed(2);
              this.dispatch("sell", id);
              this.dispatch("earnings", profit);
              this.dispatch("log", `Sold crypto with profit: ${profit} - ID: "${id}"`);
            }
          }
        }
      }

      this.dispatch("log", "");
    } catch (error) {
      // console.log(`Error running bot: ${error}`);
      this.dispatch("log", `Error running bot: ${error}`);
    }

    if (period) {
      this.timeoutID = setTimeout(() => this.start(period), 60000 * (Math.round(Math.random() * 3) + period));
    }
  }
  #isPriceStable(prices) {
    const limit = 90 / 5; // Price for 90 mins period
    const pricesLength = prices.length - limit;
    let consolidationPricePattern = false;
    const stabilized = (period) => period.every((p) => p == period[0]);

    for (let i = 0; i < pricesLength; i++) {
      // Check if price has been stable within 90 mins period
      consolidationPricePattern = stabilized(prices.slice(i, i + limit));
      if (consolidationPricePattern) break;
    }

    if (!consolidationPricePattern) return true;
    return stabilized(prices.slice(-2)); // Check if price has been stable for 15 mins
  }

  stop() {
    clearTimeout(this.timeoutID);
  }
  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }
};
