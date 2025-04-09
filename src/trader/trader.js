const { calculateFee } = require("../services");

// Smart trader
class Trader {
  constructor(exProvider, pair, interval, capital) {
    this.ex = exProvider;
    this.pair = pair;
    this.interval = +interval;
    this.capital = +capital; // Investment cptl investing Amount in ERU that will be used every time to by crypto
    // this.strategyTimestamp = info.strategyTimestamp;
    this.period = +interval; // this.period is deleted in only test trading
    // this.testMode = info.testMode;
    this.rsiPeriod = 14; // Recommended Default is 14
    this.listener = null; // Should be a function
    this.run = null; // Should be a function
    this.timeoutID = 0;

    // this.strategyRange = +range; // Range in hours "0.5 = have an hour"
    // this.pricePercentChange = +pricePercent; // Percentage Change is the price Percentage Threshold
    // this.halfPercent = this.pricePercentChange / 2;
    // this.thirdPercent = this.pricePercentChange / 3;
    // this.buySellOnPercent = this.pricePercentChange / 5;
  }

  async start() {
    try {
      if (!this.run) return;
      await this.run();
    } catch (error) {
      this.dispatch("log", `Error running bot: ${error}`);
    }
    if (this.period) this.timeoutID = setTimeout(() => this.start(), 60000 * this.period);
  }

  async sell({ id, volume, cost, price, createdAt }, cryptoBalance, bidPrice) {
    const amount = bidPrice * (cryptoBalance - volume) < 5 ? cryptoBalance : volume;
    const orderId = await this.ex.createOrder("sell", "market", this.pair, amount);
    const c = bidPrice * amount - calculateFee(bidPrice * amount, 0.4);
    const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - cost).toFixed(2);
    const orderAge = ((Date.now() - createdAt) / 60000 / 60).toFixed(1);
    this.dispatch("sell", { id, profit });
    this.dispatch("log", `Sold crypto with profit/loss: ${profit} - Age: ${orderAge}hrs`);
  }

  async sellAll() {
    const cryptoBalance = (await this.ex.balance(this.pair)).crypto;
    let profit = 0;
    if (cryptoBalance > 0) {
      const orders = await this.ex.getOrders(this.pair);
      const bidPrice = (await this.ex.currentPrices(this.pair)).bidPrice;
      const orderId = await this.ex.createOrder("sell", "market", this.pair, cryptoBalance);
      const c = bidPrice * cryptoBalance - calculateFee(bidPrice * cryptoBalance, 0.4);
      const ordersCost = orders.reduce((totalCost, { cost }) => totalCost + cost, 0);
      profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - ordersCost).toFixed(2);
    }
    this.dispatch("sell", { profit });
    this.dispatch("log", `Sold all crypto asset with profit: ${profit}`);
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.pair + "", event, info);
  }
}

module.exports = Trader;
