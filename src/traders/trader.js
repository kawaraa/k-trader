import { calculateFee } from "../services/calc-methods.js";

// Smart trader
export default class Trader {
  constructor(exProvider, pair, interval, mode) {
    this.ex = exProvider;
    this.pair = pair;
    this.interval = +interval;
    this.period = this.interval || 5; // this.period is deleted in only test trading
    this.rsiPeriod = 14; // Recommended Default is 14
    this.listener = null; // Should be a function
    this.timeoutID = 0;
    this.pauseTimer = 0;
    this.notifiedTimer = 0;

    // this.strategyRange = +range; // Range in hours "0.5 = have an hour"
    // this.pricePercentChange = +pricePercent; // Percentage Change is the price Percentage Threshold
    // this.halfPercent = this.pricePercentChange / 2;
    // this.thirdPercent = this.pricePercentChange / 3;
    // this.buySellOnPercent = this.pricePercentChange / 5;
  }

  async start() {
    try {
      if (this.pauseTimer > 0) this.pauseTimer -= 1;
      if (this.notifiedTimer > 0) this.notifiedTimer -= 1;
      if (this.run) await this.run();
    } catch (error) {
      this.dispatch("LOG", `Error running bot: ${error}`);
    }
    if (this.period) this.timeoutID = setTimeout(() => this.start(), this.period * 1000);
  }

  async run() {} // This is overwritten in derived classes

  calculateLength(hours = 6) {
    return parseInt((60 * hours) / this.interval);
  }

  async buy(investmentCapital, eurBalance, price, buyCase) {
    const cost = eurBalance < investmentCapital ? eurBalance : investmentCapital;
    const cryptoVolume = +((cost - calculateFee(cost, 0.4)) / price).toFixed(8);
    const orderId = await this.ex.createOrder("buy", "market", this.pair, cryptoVolume);
    const position = { id: orderId, price, volume: cryptoVolume, cost, createdAt: Date.now() };
    this.dispatch("BUY", position, buyCase);
  }

  async sell(oldOrder, cryptoBalance, price, sellCase) {
    const orderAge = ((Date.now() - oldOrder.createdAt) / 60000 / 60).toFixed(1);
    const cost = cryptoBalance * price - calculateFee(cryptoBalance * price, 0.4);
    const profit = cost - oldOrder.cost;
    await this.ex.createOrder("sell", "market", this.pair, cryptoBalance);

    this.dispatch("SELL", profit, sellCase);
    return { profit, age: orderAge };
  }

  async sellManually(cryptoBalance) {
    if (cryptoBalance > 0) {
      await this.ex.createOrder("sell", "market", this.pair, cryptoBalance);
      this.dispatch("LOG", `Placed SELL - for all assets`);
    }
    this.dispatch("SELL", 0, "manually");
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info, ...args) {
    if (this.listener) this.listener(this.pair, event, info, ...args);
  }
}
