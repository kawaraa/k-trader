const { calcPercentageDifference, calculateFee } = require("./trend-analysis.js");

// Smart trader
module.exports = class DailyTrader {
  #pair;
  #capital;
  #strategyRange;
  #percentageThreshold;
  constructor(exProvider, pair, { capital, strategyRange, priceChange, mode, timeInterval }) {
    this.ex = exProvider;
    this.#pair = pair;
    this.#capital = capital; // Investment cptl investing Amount in ERU that will be used every time to by crypto
    this.#strategyRange = Math.max(+strategyRange || 0, 0.25); // Range in hours "0.5 = have an hour"
    this.#percentageThreshold = Math.max(+priceChange || 0, 0.5); // Percentage Change is the price Percentage Threshold
    this.mode = mode;
    this.timeInterval = +timeInterval;
    this.period = +timeInterval; // this.period is deleted in only test trading
    this.listener = null;

    this.previouslyDropped = false;
    this.previousBidRSI = null;
  }

  async start() {
    try {
      const balance = await this.ex.balance(this.#pair); // Get current balance in EUR and the "pair"
      const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.#pair);
      const prices = await this.ex.prices(this.#pair, this.#strategyRange); // For the last xxx days

      const lowestAsk = prices.map((p) => p.askPrice).sort()[0];
      const highestBidPr = prices
        .map((p) => p.bidPrice)
        .sort()
        .at(-1);
      const orders = await this.ex.getOrders(this.#pair);
      const enoughPricesData = prices.length >= (this.#strategyRange * 60) / this.timeInterval;

      const bidPrChange = calcPercentageDifference(lowestAsk, bidPrice);
      const askPrChange = calcPercentageDifference(highestBidPr, askPrice);
      const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);
      const multiplier = this.#percentageThreshold < 5 ? 5 : 6;
      const highLiquidity = askBidSpreadPercentage < this.#percentageThreshold / multiplier;
      const goingUp = highLiquidity && bidPrChange >= this.#percentageThreshold;
      const goingDown = highLiquidity && askPrChange <= -this.#percentageThreshold;
      const goingDownSoft = highLiquidity && askPrChange <= -(this.#percentageThreshold / 1.5);

      this.dispatch(
        "log",
        `TradePrice ${tradePrice} - Ask: ${askPrice} - Bid: ${bidPrice} ${bidPrChange}% - calcPercentageDifference:${askBidSpreadPercentage} - ${-this
          .#percentageThreshold}`
      );

      // Buy
      if (enoughPricesData && goingUp) {
        this.dispatch("log", `Suggest buying: ${bidPrChange}% - LowestAsk ${lowestAsk}`);

        if (!orders[0] && this.#capital > 0 && balance.eur >= this.#capital / 2) {
          const capital = balance.eur < this.#capital ? balance.eur : this.#capital;
          const cost = capital - calculateFee(capital, 0.4);
          const investingVolume = +(cost / askPrice).toFixed(8);
          const orderId = await this.ex.createOrder("buy", "market", this.#pair, investingVolume);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Bought crypto with order ID "${orderId}" at ask Price above 👆`);
        }

        // Sell
      } else if (enoughPricesData && balance.crypto > 0 /* && (goingDown || goingDownSoft) */) {
        // const sellableOrders = orders;
        const sellableOrders = orders.filter(
          (o) => goingDown || (goingDownSoft && 0 <= calcPercentageDifference(o.price, bidPrice))
        );
        this.dispatch("log", `Suggest selling: ${askPrChange}% - HighestBidPr ${highestBidPr} -`);

        this.dispatch("log", `There are (${sellableOrders.length}) orders to sell`);
        for (const order of sellableOrders) {
          await this.#sell(order, balance.crypto, bidPrice);
        }
      }
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
    if (cryptoBalance > 0) {
      const orders = await this.ex.getOrders(this.#pair);
      const bidPrice = (await this.ex.currentPrices(this.#pair)).bidPrice;
      const orderId = await this.ex.createOrder("sell", "market", this.#pair, cryptoBalance);
      const c = bidPrice * cryptoBalance - calculateFee(bidPrice * cryptoBalance, 0.4);
      const ordersCost = orders.reduce((totalCost, { cost }) => totalCost + cost, 0);
      const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - ordersCost).toFixed(2);

      this.dispatch("earnings", profit);
      this.dispatch("log", `Sold all crypto asset with profit: ${profit}`);
    }
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.#pair + "", event, info);
  }
};
