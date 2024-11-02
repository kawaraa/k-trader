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
    this.listener = null;
    this.previousRSI = null;
  }

  async start() {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.price(this.#pair, this.#strategyRange); // For the last xxx days
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
      const totalInvestedAmount = orders.reduce((acc, o) => acc + o.cost, 0) + this.#investingCapital;
      const interval = this.period || +process.env.botTimeInterval;

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

      // high-drop
      let shouldBuy = calcPercentageDifference(highestBidPr, askPrice) < -(this.#percentageThreshold * 1.2);

      if (this.mode.includes("near-low")) {
        shouldBuy =
          calcPercentageDifference(highestBidPr, askPrice) <= -this.#percentageThreshold &&
          calcPercentageDifference(lowestAsk, askPrice) < this.#percentageThreshold / 8;
      }
      if (this.mode.includes("on-increase")) {
        shouldBuy = false;
        if (bidPriceRSI <= 30 && this.previousRSI <= bidPriceRSI) {
          shouldBuy = true;
          this.previousRSI = bidPriceRSI;
        }
      }
      if (this.mode.includes("partly-trade")) {
        // Pause buying if the bidPrice is higher then price of the last Order In the first or second Part
        const thirdIndex = Math.round(this.#capital / this.#investingCapital / 3);
        const { price } = orders[thirdIndex * 2 - 1] || orders[thirdIndex] || orders[0] || {};
        if (price && -(this.#percentageThreshold / 2) < calcPercentageDifference(price, bidPrice)) {
          shouldBuy = false;
        }
      }
      if (this.mode.includes("slowly-trade")) {
        // Pause buying if the bidPrice is not x% less then the last Order's price
        const { price } = orders.at(-1) || {};
        if (price && -(this.#percentageThreshold / 4) < calcPercentageDifference(price, bidPrice)) {
          shouldBuy = false;
        }
      }

      if (prices.length >= (this.#strategyRange * 24 * 60) / interval && shouldBuy) {
        this.dispatch("log", `Suggest buying: Lowest Ask Price is ${lowestAsk}`);

        const remaining = +(Math.min(this.#investingCapital, balance.eur) / askPrice).toFixed(8);

        if (balance.eur > 0 && totalInvestedAmount < this.#capital && remaining > this.#tradingAmount / 2) {
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, remaining);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}"`);
        }
      } else if (60 < bidPriceRSI && balance.crypto > 0 && orders[0]) {
        let sellableOrders = orders.filter((o) => {
          return this.#percentageThreshold <= calcPercentageDifference(o.price, bidPrice);
        });
        if (!sellableOrders && balance.eur < 1) {
          // Backlog: Sell accumulated orders that has been more than xxx days if the current price is higher then highest price in the lest 4 hours.
          sellableOrders = orders.filter(({ price, createdAt }) => {
            return createdAt && isOlderThen(createdAt, 2) && calcPercentageDifference(price, bidPrice) > 1;
          });
        }
        for (const order of sellableOrders) {
          await this.#sell(order, balance.crypto, bidPrice);
        }
      }

      this.dispatch("log", "");
    } catch (error) {
      // console.log(`Error running bot: ${error}`);
      this.dispatch("log", `Error running bot: ${error}`);
    }

    if (this.period) this.timeoutID = setTimeout(() => this.start(), 60000 * this.period);
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
