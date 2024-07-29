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
const limitDaysMs = 1000 * 60 * 60 * 24 * 2; // 2 days in milliseconds

module.exports = class DailyTrader {
  #pair;
  #pricePercentageThreshold;
  #tradingAmount;
  #investedCapital;
  constructor(name, exchangeProvider, pair, strategy, allowedPercentageChange, investingAmount) {
    this.name = name;
    this.ex = exchangeProvider;
    this.strategy = strategy;
    this.logger = new Logger(name, true); // + "-daily-trader"
    this.state = new TradingState(`${name}-state.json`);
    this.#pair = pair;
    this.#pricePercentageThreshold = allowedPercentageChange; // percentageMargin
    this.#investedCapital = investingAmount; // investing Amount that will be used every time to by crypto
    this.#tradingAmount = 0; // cryptoTradingAmount
    this.decision = "hold";
  }

  async start(period = 4) {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const currentPrice = await this.ex.currentPrice(this.#pair);
      const allPrices = await this.ex.prices(this.#pair); // For the last 2.5 days
      const prices = allPrices.slice(-144); // The last 12 hours
      this.#tradingAmount = +(this.#investedCapital / currentPrice).toFixed(4);
      let currentStrategy = this.strategy;

      // Safety Check
      const sorted = prices.toSorted();
      const highest = sorted[sorted.length - 1];
      const trendChange = analyzer.calculatePercentageChange(highest, sorted[0]);
      const [low, high, time] = this.state.getSpike();

      if (this.#pricePercentageThreshold * 2 <= trendChange) {
        // Lock the decision to "hold" when there is a sudden significant rise in the price
        currentStrategy = "unknown";
        if (highest == 0) this.state.updateSpike(sorted[0], highest);
        else if (high < highest) this.state.updateSpike(low, highest);
        this.logger.warn("The price is experiencing a significant increase");
      } else if (analyzer.calculatePercentageChange(currentPrice, low) <= this.#pricePercentageThreshold) {
        // Unlock the decision when the current price is close to the low price in last two days
        currentStrategy = this.strategy;
        this.state.updateSpike(0, 0);
      } else if (Date.pars(time) < Date.now() - limitDaysMs) {
        // Or unlock the decision when it passes two days
        currentStrategy = "average-price";
        this.state.updateSpike(0, 0);
      }

      const rsi = analyzer.calculateRSI(prices);
      const sortedPrices = prices.slice(-24).sort(); // last 2 hours
      const highestPrice = sortedPrices[sortedPrices.length - 1];
      const lowestChange = analyzer.calculatePercentageChange(currentPrice, sortedPrices[0]);
      const highestChange = analyzer.calculatePercentageChange(currentPrice, highestPrice);

      if (currentStrategy == "average-price") {
        this.decision = analyzer.calculateAveragePrice(prices, currentPrice, this.#pricePercentageThreshold);
      } else if (currentStrategy == "highest-price") {
        if (highestChange <= -this.#pricePercentageThreshold) this.decision = "buy";
        if (this.#pricePercentageThreshold <= lowestChange) this.decision = "sell";
      }

      // Testing Starts
      const averagePrice = analyzer.calculateAveragePrice(prices);
      this.logger.info("Current balance => eur:", balance.eur, ` <|>  ${this.name}:`, balance.crypto);
      this.logger.info(
        `RSI: ${rsi} => ${this.decision}`,
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

      if (rsi < 30 && this.decision == "buy") {
        this.logger.info("Suggest buying crypto because the price dropped");

        // calculates the amount of a cryptocurrency that can be purchased given current balance in fiat money and the price of the cryptocurrency.
        const remainingAmount = +(Math.min(this.#investedCapital, balance.eur) / currentPrice).toFixed(4);

        if (balance.eur > 0 && remainingAmount > this.#tradingAmount / 2) {
          // Buy here
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, amount);
          const order = await this.ex.getOrder(orderId);
          this.state.addOrder(order);
          this.logger.warn(`Bought crypto with order ID "${order.id}"`);
        }
      } else if (70 < rsi) {
        this.logger.info("Suggest selling crypto because the price rose / increased");
        // Get Orders that have price Lower Than the Current Price
        let orders = this.state.getOrder(
          (order) =>
            this.#pricePercentageThreshold <= analyzer.calculatePercentageChange(currentPrice, order.price)
        );

        // // Backlog: Sell accumulated orders that has been more than 4 days if the current price is higher then highest price in the lest 4 hours.
        // if (highestPrice <= currentPrice || 0 <= highestChange) {
        //   const check = (o) => 60000 * 60 * 24 * 4 <= Date.now() - Date.parse(o.timeStamp);
        //   orders = orders.concat(this.state.getOrder(check));
        // }

        // Sell the found orders
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

    setTimeout(() => this.start(), 60000 * (Math.round(Math.random() * 3) + period));
  }
};

/* ========== Old code ========== */

/* ===== Prices data ===== */
// https://api.kraken.com/0/public/AssetPairs?pair=eth/eur&interval=5
// https://api.kraken.com/0/public/OHLC?pair=eth/eur&interval=5
// "OHLC Data" stands for Open, High, Low, Close data, which represents the prices at which an asset opens, reaches its highest, reaches its lowest, and closes during a specific time interval.
// const getPairData = (route = "OHLC", pair = "eth/eur", interval = 5) => {
//   // route: AssetPairs / OHLC`
//   return `/0/public/${route}?pair=${pair}&interval=${interval}`;
// };

/* ===== Order data ===== */
// const openOrders = await kraken.privateApi("OpenOrders");
// console.log("openOrders:", openOrders.open);
// const closedOrders = await kraken.privateApi("ClosedOrders");
// console.log("closedOrders:", closedOrders.closed);
