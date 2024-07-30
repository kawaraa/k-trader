/*
This strategy based on 5 to 8 mins interval and checking the last 4 hours on every 5 mins change:
1. Buy if price 1, 2, or 3 up to 24 drops 1.5% 
2. Sell if current price is 1.5% higher than the order price

Recommendation:
- if it's daily trading strategy, buy when the current price is 1.5% lower then any price in the last 4 hours
- if it's monthly trading strategy, buy when the current price is 1.5% lower then the average price in the last 5 days
*/

const { Logger } = require("k-utilities");
const TradingState = require("./trading-state.js");
const analyzer = require("./trend-analysis.js");

module.exports = class DailyTrader {
  #pair;
  #pricePercentageThreshold;
  #tradingAmount;
  #investedCapital;
  constructor(name, exchangeProvider, pair, strategy, percentageChange, investingAmount, safetyTimeline) {
    this.name = name;
    this.ex = exchangeProvider;
    this.strategy = strategy;
    this.logger = new Logger(name || pair, true); // + "-daily-trader"
    this.state = new TradingState(`${name}-state.json`);
    this.#pair = pair;
    this.#pricePercentageThreshold = percentageChange; // percentageMargin
    this.#investedCapital = investingAmount; // investing Amount that will be used every time to by crypto
    this.#tradingAmount = 0; // cryptoTradingAmount
    this.safetyTimeline = safetyTimeline < 60 ? safetyTimeline : 48; // Number of hours, Default is 48 hours, the limit is 60 (2.5 days) because the price interval is 5 in the Exchange Provider
  }

  async start(period) {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const currentPrice = await this.ex.currentPrice(this.#pair);
      const allPrices = await this.ex.prices(this.#pair); // For the last 2.5 days
      const prices = allPrices.slice(-144); // The last 12 hours
      this.#tradingAmount = +(this.#investedCapital / currentPrice).toFixed(4);
      let decision = "hold";
      let currentStrategy = this.strategy;

      // Safety Check
      const sorted = allPrices.slice(-((60 * this.safetyTimeline) / 5)).toSorted();
      const highest = sorted[sorted.length - 1];
      const spikeChange = analyzer.calculatePercentageChange(highest, sorted[0]);
      const trendChange = analyzer.calculatePercentageChange(currentPrice, sorted[0]);
      // Check if the highest price in the last xxx is too high
      if (this.#pricePercentageThreshold * 2 <= spikeChange) {
        // Pause buying when there is a sudden significant rise in the price or if the price keeps rising
        currentStrategy = null;

        // Check if the current price is close to the low price
      } else if (this.#pricePercentageThreshold < trendChange) {
        currentStrategy = null; // Pause buying when the price is still high
      }

      if (!currentStrategy) {
        this.logger.warn("Paused buying: The price is experiencing a significant increase");
      } else {
        // // Or resume buying when the price spike passes two days
        //  this.logger.warn("Resumed buying: The price returned to it's 'original' state or stabilized");
      }

      const rsi = analyzer.calculateRSI(prices);
      const sortedPrices = prices.slice(-24).sort(); // last 2 hours
      const highestPrice = sortedPrices[sortedPrices.length - 1];
      const lowestChange = analyzer.calculatePercentageChange(currentPrice, sortedPrices[0]);
      const highestChange = analyzer.calculatePercentageChange(currentPrice, highestPrice);

      if (currentStrategy == "average-price") {
        decision = analyzer.calculateAveragePrice(prices, currentPrice, this.#pricePercentageThreshold);
      } else if (currentStrategy == "highest-price") {
        if (highestChange <= -this.#pricePercentageThreshold) decision = "buy";
        if (this.#pricePercentageThreshold <= lowestChange) decision = "sell";
      }

      // Testing Starts
      const averagePrice = analyzer.calculateAveragePrice(prices);
      this.logger.info("Current balance => eur:", balance.eur, ` <|>  ${this.name}:`, balance.crypto);
      this.logger.info(
        `RSI: ${rsi} => ${decision}`,
        "- Current:",
        currentPrice,
        "- Lowest:",
        sortedPrices[0],
        "- Average:",
        averagePrice,
        `${analyzer.calculatePercentageChange(currentPrice, averagePrice)}%`,
        "- Highest:",
        sortedPrices[sortedPrices.length - 1],
        `${highestChange}%`
      );
      // Testing Ends

      if (rsi < 30 && decision == "buy") {
        this.logger.warn("Suggest buying: the price dropped");

        // calculates the amount of a cryptocurrency that can be purchased given current balance in EUR and the price of the cryptocurrency.
        const remainingAmount = +(Math.min(this.#investedCapital, balance.eur) / currentPrice).toFixed(4);

        if (balance.eur > 0 && remainingAmount > this.#tradingAmount / 2) {
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, remainingAmount);
          const order = await this.ex.getOrder(orderId);
          this.state.addOrder(order);
          this.logger.warn(`Bought crypto with order ID "${order.id}"`);
        }
        //
      } else if (70 < rsi) {
        this.logger.warn("Suggest selling: the price rose / increased");
        // Get Orders that have price Lower Than the Current Price
        const orders = this.state.getOrder(
          (order) =>
            this.#pricePercentageThreshold <= analyzer.calculatePercentageChange(currentPrice, order.price)
        );

        // // Backlog: Sell accumulated orders that has been more than 4 days if the current price is higher then highest price in the lest 4 hours.
        // if (highestPrice <= currentPrice || 0 <= highestChange) {
        //   const check = (o) => 60000 * 60 * 24 * 4 <= Date.now() - Date.parse(o.timeStamp);
        //   orders = orders.concat(this.state.getOrder(check));
        // }

        if (balance.crypto > 0 && orders[0]) {
          for (const { id, volume } of orders) {
            await this.ex.createOrder("sell", "market", this.#pair, Math.min(volume, balance.crypto));
            this.state.remove(id);
            this.logger.warn(`Sold crypto with order ID "${id}"`);
          }
        }
      } else {
        this.logger.info("Suggest waiting for the price to change...");
      }
    } catch (error) {
      this.logger.error("Error running bot:", error);
    }

    if (period) setTimeout(() => this.start(), 60000 * (Math.round(Math.random() * 3) + period));
  }
};
