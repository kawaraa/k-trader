/*
This strategy based on 5 to 8 mins interval and checking the last 4 hours on every 5 mins change:
1. Buy if price 1, 2, or 3 up to 24 drops 1.5% 
2. Sell if current price is 1.5% higher than the order price

Recommendation:
- if it's daily trading strategy, buy when the current price is 1.5% lower then any price in the last 4 hours
- if it's monthly trading strategy, buy when the current price is 1.5% lower then the average price in the last 5 days
*/

const TradingState = require("./trading-state.js");
const analyzer = require("./trend-analysis.js");

// Smart trader
module.exports = class DailyTrader {
  #pair;
  #capital;
  #investingCapital;
  #pricePercentageThreshold;
  #tradingAmount;
  constructor(exProvider, pair, info) {
    const { capital, investment, priceChange, strategyRange, safetyTimeline } = info;
    this.ex = exProvider;
    this.state = new TradingState(`${pair}.json`);
    this.#pair = pair;
    this.#capital = capital;
    this.#investingCapital = investment; // investing Amount in ERU that will be used every time to by crypto
    this.#pricePercentageThreshold = priceChange; // Percentage Change
    this.#tradingAmount = 0; // cryptoTradingAmount
    this.strategyRange = Math.max(+strategyRange || 0, 0.5); // Range in days
    this.safetyTimeline = safetyTimeline > 0 || safetyTimeline <= strategyRange * 24 ? safetyTimeline : 8; // The number of hours that will be monitored in case a price spike happen
    this.listener = null;
  }

  async start(period) {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const currentPrice = await this.ex.currentPrice(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.strategyRange); // For the last xxx days
      this.#tradingAmount = +(this.#investingCapital / currentPrice).toFixed(8);

      const ordersIds = this.state.getOrders().join(",");
      const orders = await this.ex.getOrders(ordersIds);
      const rsi = analyzer.calculateRSI(prices);
      let decision = analyzer.calculateAveragePrice(prices, currentPrice, this.#pricePercentageThreshold);

      // Safety Check
      const sorted = prices.slice(-((this.safetyTimeline * 60) / 5)).toSorted();
      const spikeChange = analyzer.calculatePercentageChange(sorted[sorted.length - 1], sorted[0]);
      const trendChange = analyzer.calculatePercentageChange(currentPrice, sorted[0]);

      // Check if the highest price in the last xxx is too high
      // Check if the current price is still not close to the lowest price in the last xxx
      if (this.#pricePercentageThreshold * 2 <= spikeChange && this.#pricePercentageThreshold < trendChange) {
        // Pause buying when there is a sudden significant rise in the price or if the price keeps rising
        decision = "hold";
        this.dispatch("log", `Paused buying: The price is experiencing a significant increase`);
      }
      // Else the price spike has passed or the stabilized

      const averagePrice = analyzer.calculateAveragePrice(prices);
      const change = analyzer.calculatePercentageChange(currentPrice, averagePrice);
      const name = this.#pair.replace("EUR", "").toLowerCase();
      this.dispatch("currentPrice", currentPrice);
      this.dispatch("priceChange", change);
      this.dispatch("balance", balance.crypto);
      this.dispatch("log", `Current balance => eur: ${balance.eur} <|> ${name}: ${balance.crypto}`);
      this.dispatch(
        "log",
        `RSI: ${rsi} => ${decision} - Current: ${currentPrice} - Average: ${averagePrice} ${change}%`
      );

      if (rsi < 30 && decision == "buy") {
        this.dispatch("log", `Suggest buying: the price dropped`);

        // Calculates the amount of a cryptocurrency that can be purchased given current balance in EUR and the price of the cryptocurrency.
        const remaining = +(Math.min(this.#investingCapital, balance.eur) / currentPrice).toFixed(8);
        const totalInvestedAmount = orders.reduce((acc, o) => acc + o.cost, 0) + this.#investingCapital;

        if (balance.eur > 0 && remaining > this.#tradingAmount / 2 && totalInvestedAmount < this.#capital) {
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, remaining);
          this.state.addOrder(orderId);
          this.dispatch("buy", 1);
          this.dispatch("log", `Bought crypto with order ID "${orderId}"`);
        }
        //
      } else if (70 < rsi) {
        this.dispatch("log", `Suggest selling: the price rose / increased`);

        // Get Orders that have price Lower Than the Current Price
        const ordersForSell = orders.filter(
          (o) => this.#pricePercentageThreshold <= analyzer.calculatePercentageChange(currentPrice, +o.price)
        );

        // // Backlog: Sell accumulated orders that has been more than 4 days if the current price is higher then highest price in the lest 4 hours.
        // if (decision == "hold" && 2 <= change) {
        //   const check = (o) => 60000 * 60 * 24 * 7 <= Date.now() - Date.parse(o.timeStamp);
        //   ordersForSell = ordersForSell.concat(orders.filter(check));
        // }

        if (balance.crypto > 0 && ordersForSell[0]) {
          for (const { id, volume, price } of ordersForSell) {
            console.log(ordersForSell.length, id, volume, price, "=>", currentPrice);
            await this.ex.createOrder("sell", "market", this.#pair, Math.min(+volume, balance.crypto));
            this.state.remove(id);
            const change = analyzer.calculatePercentageChange(currentPrice, +price);
            const profit = analyzer.calculateProfit(currentPrice, +price, +volume, 0.4);
            this.dispatch("sell", 1);
            this.dispatch("earnings", +profit.toFixed(2));
            this.dispatch("log", `Sold crypto with ${change} => profit: ${profit} ID: "${id}"`);
            this.dispatch("log", `ID: ${id} OrderPrice: ${price} "=>" CurrentPrice: ${currentPrice}`);
          }
        }
      } else {
        // this.dispatch("log", `Waiting for the price to change...`);
      }
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
