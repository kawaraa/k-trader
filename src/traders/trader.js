import { calculateFee } from "../services/calc-methods.js";

// Smart trader
export default class Trader {
  constructor(exProvider, pair, interval) {
    this.ex = exProvider;
    this.pair = pair;
    this.interval = +interval;
    this.period = this.interval || 5; // this.period is deleted in only test trading
    this.rsiPeriod = 14; // Recommended Default is 14
    this.listener = null; // Should be a function
    this.timeoutID = 0;
    this.pauseTimer = 0;
    this.notifiedTimer = 0;
    this.profitTarget = 8;
    this.stopLossPrice = null;

    // this.strategyRange = +range; // Range in hours "0.5 = have an hour"
    // this.pricePercentChange = +pricePercent; // Percentage Change is the price Percentage Threshold
  }

  async start() {
    try {
      if (this.run) await this.run();
    } catch (error) {
      this.dispatch("LOG", `Error running bot: ${error}`);
    }
    if (this.period) this.timeoutID = setTimeout(() => this.start(), this.period * 1000);
  }

  // This is overwritten in derived classes
  async run() {
    if (this.pauseTimer > 0) this.pauseTimer -= 1;
    if (this.notifiedTimer > 0) this.notifiedTimer -= 1;
  }

  async buy(investmentCapital, eurBalance, price, buyCase) {
    const cost = eurBalance < investmentCapital ? eurBalance : investmentCapital;
    const cryptoVolume = +((cost - calculateFee(cost, 0.4)) / price).toFixed(8);
    const orderId = await this.ex.createOrder("buy", "market", this.pair, cryptoVolume);
    const position = { id: orderId, price, volume: cryptoVolume, cost, createdAt: Date.now() };
    if (buyCase == "manually") {
      this.profitTarget = 8;
      this.stopLossPrice = price * 0.98;
    }
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

  calculateLength(hours = 6) {
    if (!this.interval) throw "500-Interval is not set";
    return parseInt((60 * hours) / this.interval);
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info, ...args) {
    if (this.listener) this.listener(this.pair, event, info, ...args);
  }
}
