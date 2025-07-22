import { calcPercentageDifference } from "../../shared-code/utilities.js";
import { calculateFee } from "../services/calc-methods.js";

// Smart trader
export default class Trader {
  constructor(exProvider, pair, interval, tracker, mode) {
    this.ex = exProvider;
    this.pair = pair;
    this.interval = +interval;
    this.period = this.interval || 5; // this.period is deleted in only test trading
    this.rsiPeriod = 14; // Recommended Default is 14
    this.listener = null; // Should be a function
    this.timeoutID = 0;
    this.pause = false;
    this.pauseTimer = 0;
    this.notifiedTimer = 0;
    this.tracker = tracker || [[null, null, null]];
    this.priceLevel = [];
    this.changePct = 0;

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

  async buy(investmentCapital, eurBalance, price, buyCase) {
    const cost = eurBalance < investmentCapital ? eurBalance : investmentCapital;
    const cryptoVolume = +((cost - calculateFee(cost, 0.4)) / price).toFixed(8);
    const orderId = await this.ex.createOrder("buy", "market", this.pair, cryptoVolume);
    const position = { id: orderId, price, volume: cryptoVolume, cost, createdAt: Date.now() };
    this.buySignal = buyCase;
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
  trackPrice(price) {
    if (!this.tracker[0][0] || this.tracker[0][0] > price) {
      this.tracker[0][0] = price; // Support Price Level
      this.tracker[0][2] = "downtrend";
    }
    if (!this.tracker[0][1] || this.tracker[0][1] < price) {
      this.tracker[0][1] = price; // Resistance Price Level
      this.tracker[0][2] = "uptrend";
    }

    const heigh = calcPercentageDifference(this.tracker[0][0], this.tracker[0][1]);
    const limit = Math.max(Math.min(heigh / 4, 2), 1);

    if (heigh >= 2) {
      let reachedLimit = false;
      if (this.tracker[0][2] == "uptrend") {
        reachedLimit = -calcPercentageDifference(this.tracker[0][1], price) >= limit;
      } else {
        reachedLimit = calcPercentageDifference(this.tracker[0][0], price) >= limit;
      }

      if (reachedLimit) {
        this.tracker.push(this.tracker[0]);
        this.tracker[0] = [null, null, null];
        if (this.tracker.length > 5) this.tracker.splice(1, 1);
      }

      const prices = this.tracker
        .slice(1)
        .flat()
        .filter((p) => p && !isNaN(+p));
      this.priceLevel[0] = Math.min(...prices);
      this.priceLevel[1] = Math.max(...prices);
      this.changePct = calcPercentageDifference(this.priceLevel[0], this.priceLevel[1]) || 0;
      if (prices[0] > prices.at(-1)) this.changePct = -this.changePct;
    }

    const prevMove2 = this.tracker.at(-3);
    const prevMove = this.tracker.at(-2);
    const lastMove = this.tracker.at(-1);

    if (this.tracker.length > 1 && price > lastMove[1]) return "uptrend";
    if (this.tracker.length > 1 && lastMove[0] > price) return "downtrend";
    if (this.tracker.length > 2) {
      const case2 = prevMove2 && prevMove2[2] == "uptrend" && lastMove[2] == "uptrend";
      if ((lastMove[2] == "uptrend" && lastMove[1] > prevMove[1]) || case2) {
        return "uptrend";
      }
      if (prevMove[2] == "downtrend" && lastMove[2] == "downtrend" && prevMove[1] > lastMove[1]) {
        return "downtrend";
      }
    }

    return "unknown";
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info, ...args) {
    if (this.listener) this.listener(this.pair, event, info, ...args);
  }
}
