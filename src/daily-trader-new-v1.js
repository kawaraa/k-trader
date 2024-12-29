const { calculateRSI, calcPercentageDifference, calculateFee, isOlderThen } = require("./trend-analysis.js");

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
    this.lowRSI = mode?.includes("hard") ? 25 : 30;
    this.highRSI = mode?.includes("hard") ? 80 : 75;
    this.buyOnRSI = mode?.includes("hard") ? 45 : 50;
    this.previousBidRSI = 50;
    this.listener = null;
  }

  async start() {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.#strategyRange); // For the last xxx days
      this.#tradingAmount = +(this.#investingCapital / bidPrice).toFixed(8);

      const askPrices = prices.map((p) => p.askPrice);
      const bidPrices = prices.map((p) => p.bidPrice);
      const orders = await this.ex.getOrders(this.#pair);
      const askPriceRSI = calculateRSI(askPrices);
      const bidPriceRSI = calculateRSI(bidPrices);
      const highestBidPr = bidPrices.sort().at(-1);
      const lowestAsk = askPrices.sort()[0];
      const orderLimit = (parseInt(this.#capital / this.#investingCapital) || 1) - 1;
      const interval = this.period || this.timeInterval; // this.timeInterval is used only in test trading
      const enoughPricesData = prices.length >= (this.#strategyRange * 24 * 60) / interval;
      const goingDown = this.previousBidRSI > this.highRSI && bidPriceRSI <= this.buyOnRSI;
      const goingUp = this.previousBidRSI < this.lowRSI && bidPriceRSI >= this.buyOnRSI;

      // 1. On price drop mode
      const highDropChange = calcPercentageDifference(highestBidPr, askPrice);
      let shouldBuy = highDropChange < -(this.#percentageThreshold * 1.2);

      // 2. On price increase mode
      if (this.mode.includes("on-increase")) {
        shouldBuy = shouldBuy && goingUp;
      }

      // Buy
      if (enoughPricesData && shouldBuy) {
        this.dispatch("log", `Suggest buying: Lowest Ask Price is ${lowestAsk}`);

        if (!orders[orderLimit] && balance.eur >= this.#investingCapital) {
          const cost = this.#investingCapital - calculateFee(this.#investingCapital, 0.4);
          const investingVolume = +(cost / askPrice).toFixed(8);
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, investingVolume);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}"`);
        }

        // Sell
      } else if (enoughPricesData && balance.crypto > 0 && goingDown) {
        this.dispatch("log", `Suggest selling, there are (${orders.length}) orders`);
        let sellableOrders = orders.filter((o) => {
          return this.#percentageThreshold <= calcPercentageDifference(o.price, bidPrice);
        });

        // if (!sellableOrders[0] && orders[orderLimit]) {
        //   // Backlog: Sell accumulated orders that has been more than xxx days if the current price is higher then highest price in the lest xxx hours.
        //   sellableOrders = orders.filter((o) =>
        //     isOlderThen(o.createdAt, Math.max(this.#strategyRange * 4, 2.5))
        //   );
        // }

        this.dispatch("log", `There are (${sellableOrders.length}) sellable orders`);

        for (const order of sellableOrders) {
          await this.#sell(order, balance.crypto, bidPrice);
        }
      }

      if (bidPriceRSI > this.highRSI || askPriceRSI < this.lowRSI) this.previousBidRSI = bidPriceRSI;
      this.dispatch("log", "");
    } catch (error) {
      this.dispatch("log", `Error running bot: ${error}`);
    }
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

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }
};
