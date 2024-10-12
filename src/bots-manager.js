const KrakenExchangeProvider = require("./kraken-ex-provider");
const DailyTrader = require("./daily-trader");
const { existsSync, writeFileSync, statSync, appendFileSync } = require("node:fs");
const { dateToString, toShortDate, delay } = require("./utilities");
const LocalState = require("./local-state");

const state = new LocalState("state");
const ex = new KrakenExchangeProvider(require("../.env.json").KRAKEN_CREDENTIALS, state);

class BotsManager {
  static #bots = {};
  static #randomTimeInterval = 0;
  static state = state;

  static loadBots() {
    const bots = this.state.getBots();
    Object.keys(bots).forEach((p) => (this.#bots[p] = new Bot(bots[p], new DailyTrader(ex, p, bots[p]))));
  }
  static getEurBalance() {
    return ex.balance("all");
  }

  static get(pair) {
    if (!pair) return this.#bots;
    else if (this.#bots[pair]) return { [pair]: this.#bots[pair] };
    else if (pair == "running") {
      let bots = {};
      Object.keys(this.#bots).forEach((key) => {
        if (this.#bots[key].startedOn) bots[key] = this.#bots[key];
      });
      return bots;
    }
    return null;
  }
  static add(pair, info) {
    this.#bots[pair] = new Bot(info, new DailyTrader(ex, pair, info));
    this.state.update(this.#bots);
  }
  static update(pair, info) {
    this.#bots[pair].stop();
    this.#bots[pair] = new Bot(info, new DailyTrader(ex, pair, info));
    this.state.update(this.#bots);
  }
  static remove(pair) {
    this.#bots[pair].stop();
    delete this.#bots[pair];
    this.state.update(this.#bots);
  }
  static run(pair) {
    this.#bots[pair].start(this.#bots[pair].timeInterval);
  }
  static stop(pair) {
    this.#bots[pair].stop();
  }
  static async sellAllOrders(pair) {
    const crypto = (await ex.balance(pair)).crypto;
    if (crypto > 0) await ex.createOrder("sell", "market", pair, crypto);
    const bot = this.#bots[pair];
    bot.sold += bot.orders.length;
    bot.orders = [];
    this.state.update(this.get());
  }
  static async runAll(basePeriod = 5) {
    const pairs = Object.keys(this.#bots);
    this.#randomTimeInterval = (60000 * (Math.round(Math.random() * 3) + basePeriod)) / pairs.length;

    for (const pair of pairs) {
      if (!this.#randomTimeInterval) {
        this.#bots[pair].stop();
        continue;
      }
      if (!this.#bots[pair].startedOn) this.#bots[pair].startedOn = dateToString();
      this.#bots[pair].stop(true);
      this.#bots[pair].start();
      await delay(this.#randomTimeInterval);
    }
    if (this.#randomTimeInterval) this.runAll(basePeriod);
  }
  static stopAll() {
    this.#randomTimeInterval = 0;
  }

  static updateBotProgress(pair, event, info) {
    if (event == "log") {
      const filePath = `database/logs/${pair}.log`;

      if (!info) info = "\n";
      else info = `[${toShortDate()}] ${info}\n`;

      if (!existsSync(filePath)) writeFileSync(filePath, info);
      else {
        const fileSizeInKB = statSync(filePath).size / 1024; // Convert size from B to KB
        // if file less then 500 KB append logs to file, else, overwrite the old logs
        fileSizeInKB < 500 ? appendFileSync(filePath, info) : writeFileSync(filePath, info);
      }
    }

    const bot = this.#bots[pair];
    if (event == "buy") {
      bot.bought += 1;
      bot.orders.push(info);
    } else if (event == "sell") {
      bot.sold += 1;
      bot.orders = bot.orders.filter((id) => id != info);
    } else if (event == "earnings") bot.earnings += info;
    else if (event == "balance") bot.balance = info;

    this.state.update(this.get());
  }

  static syncBots(bots) {
    const pairs = Object.keys(this.get());
    const pairsFromFirestore = Object.keys(bots);
    if (pairsFromFirestore.length == 0) pairs.forEach((pair) => this.remove(pair));
    else {
      pairsFromFirestore.forEach((pair) => !this.get(pair) && this.add(pair, bots[pair]));
      pairs.forEach((pair) => !bots[pair] && this.remove(pair));
    }
    return this.get();
  }
}

class Bot {
  #trader;
  constructor(info, trader) {
    this.capital = +this.#parseValue(info.capital);
    this.investment = +this.#parseValue(info.investment);
    this.strategyRange = +this.#parseValue(info.strategyRange);
    this.priceChange = +this.#parseValue(info.priceChange);
    this.mode = this.#parseValue(info.mode);
    this.timeInterval = +this.#parseValue(info.timeInterval);
    this.balance = +(this.#parseValue(info.balance) || 0);
    this.earnings = +(this.#parseValue(info.earnings) || 0);
    this.sold = +(this.#parseValue(info.sold) || 0);
    this.bought = +(this.#parseValue(info.bought) || 0);
    this.orders = this.#parseValue(info.orders) || [];
    this.createTime = this.#parseValue(info.createTime);
    this.updateTime = this.#parseValue(info.updateTime);
    this.startedOn = null;
    if (trader) trader.listener = (...arg) => BotsManager.updateBotProgress(...arg);
    this.#trader = trader;
  }
  #parseValue(value) {
    if (value?.arrayValue) {
      if (!Array.isArray(value?.arrayValue?.values)) return [];
      return value.arrayValue.values.map((item) => this.#parseValue(item));
    }
    return value?.stringValue || value?.integerValue || value?.doubleValue || value;
  }

  start() {
    if (arguments[0]) this.startedOn = dateToString();
    this.#trader.start(...arguments);
  }
  stop() {
    if (!arguments[0]) this.startedOn = null;
    this.#trader.stop(...arguments);
  }
}

BotsManager.loadBots();
console.log("====> Bots are loaded. <====");

module.exports = { BotsManager, Bot };
