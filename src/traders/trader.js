import { calcAveragePrice, calcPercentageDifference, isNumber } from "../../shared-code/utilities.js";
import { calculateFee } from "../services/calc-methods.js";

// Smart trader
export default class Trader {
  constructor(exProvider, pair, interval, tracker, pricesChanges) {
    this.ex = exProvider;
    this.pair = pair;
    this.interval = +interval;
    this.period = this.interval || 5; // this.period is deleted in only test trading
    this.pricesChanges = pricesChanges || [];
    this.changeLimit = 4;
    this.rsiPeriod = 14; // Recommended Default is 14
    this.listener = null; // Should be a function
    this.timeoutID = 0;
    this.pause = false;
    this.pauseTimer = 0;
    this.notifiedTimer = 0;
    this.tracker = tracker || [[null, null, null, null]];
    this.priceLevel = [];
    this.changePct = 0;
    this.volatilityTracker = [[null, null, null]];

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

  trackVolatility(price, min = 0.5, max = 3) {
    if (!this.volatilityTracker[0][0] || this.volatilityTracker[0][0] > price) {
      this.volatilityTracker[0][0] = price;
    }
    if (!this.volatilityTracker[0][1] || this.volatilityTracker[0][1] < price) {
      this.volatilityTracker[0][1] = price;
    }

    const nearLow = Math.abs(calcPercentageDifference(this.volatilityTracker[0][0], price));
    const nearHigh = Math.abs(calcPercentageDifference(this.volatilityTracker[0][1], price));

    if (nearHigh > nearLow) this.volatilityTracker[0][2] = "downtrend";
    if (nearHigh < nearLow) this.volatilityTracker[0][2] = "uptrend";

    const change = calcPercentageDifference(this.volatilityTracker[0][0], this.volatilityTracker[0][1]);

    if (change > max) this.volatilityTracker[0] = [null, null, null];
    else if (isNumber(change, min, max)) {
      const limit = change / 3;
      if (this.volatilityTracker[0][2] == "uptrend" && nearHigh > limit) {
        this.volatilityTracker.push([change, this.volatilityTracker[0][2]]);
        this.volatilityTracker[0] = [price, this.volatilityTracker[0][1], "downtrend"];
      } else if (this.volatilityTracker[0][2] == "downtrend" && nearLow > limit) {
        this.volatilityTracker.push([change, this.volatilityTracker[0][2]]);
        this.volatilityTracker[0] = [this.volatilityTracker[0][0], price, "uptrend"];
      }

      if (this.volatilityTracker.length > 5) this.volatilityTracker.splice(1, 1);
    }

    return +(
      this.volatilityTracker.slice(1).reduce((t, item) => t + item[0], 0) /
      (this.volatilityTracker.length - 1)
    ).toFixed(2);
  }

  trackPrice(price, volume) {
    if (!this.tracker[0][0] || this.tracker[0][0] > price) this.tracker[0][0] = price; // Support Price Level
    if (!this.tracker[0][1] || this.tracker[0][1] < price) this.tracker[0][1] = price; // Resistance Price Level
    this.tracker[0][2] = volume;

    const nearLow = Math.abs(calcPercentageDifference(this.tracker[0][0], price));
    const nearHigh = Math.abs(calcPercentageDifference(this.tracker[0][1], price));

    if (nearHigh > nearLow) this.tracker[0][3] = "downtrend";
    if (nearHigh < nearLow) this.tracker[0][3] = "uptrend";

    const change = calcPercentageDifference(this.tracker[0][0], this.tracker[0][1]);

    if (change > this.changeLimit) {
      const limit = Math.max(Math.min(change / 3, 2), 1.5);

      if (this.tracker[0][3] == "uptrend" && nearHigh > limit) {
        this.tracker.push(this.tracker[0]);
        this.tracker[0] = [price, this.tracker[0][1], volume, "downtrend"];
      } else if (this.tracker[0][3] == "downtrend" && nearLow > limit) {
        this.tracker.push(this.tracker[0]);
        this.tracker[0] = [this.tracker[0][0], price, volume, "uptrend"];
      }

      if (this.tracker.length > 4) this.tracker.splice(1, 1);

      const prices = this.tracker
        .slice(1)
        .map((m) => [m[0], m[1]])
        .flat();

      this.priceLevel[0] = !prices[0] ? price : Math.min(...prices);
      this.priceLevel[1] = !prices[0] ? price : Math.max(...prices);

      this.changePct = calcPercentageDifference(this.priceLevel[0], this.priceLevel[1]) || 0;

      if (this.pricesChanges.at(-1) !== this.changePct) this.pricesChanges.push(this.changePct);
      if (this.pricesChanges.length > 10) this.pricesChanges.shift();
      this.changeLimit = Math.max(Math.min(parseInt(calcAveragePrice(this.pricesChanges, 10) / 3), 6), 4);
    }

    return this.tracker[0].at(-1);
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info, ...args) {
    if (this.listener) this.listener(this.pair, event, info, ...args);
  }
}
