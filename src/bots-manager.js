const KrakenExchangeProvider = require("./providers/kraken-ex-provider");
const BasicTrader = require("./trader/basic-trader");
const AdvanceTrader = require("./trader/advance-trader");
const { existsSync, writeFileSync, statSync, appendFileSync } = require("node:fs");
const { dateToString, toShortDate, delay } = require("./utilities");
const LocalState = require("./local-state");

const state = new LocalState("state");
const ex = new KrakenExchangeProvider(require("../.env.json").KRAKEN_CREDENTIALS, state);
const traders = { basic: BasicTrader, advance: AdvanceTrader };

class BotsManager {
  static #bots = {};
  static state = state;

  static loadBots() {
    const bots = this.state.getBots();
    Object.keys(bots).forEach((p) => {
      const Trader = traders[bots[p].trader];
      this.#bots[p] = new Bot(bots[p], new Trader(ex, p, bots[p]));
    });
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
    this.#bots[pair] = new Bot(info, new SwingTrader(ex, pair, info));
    this.state.update(this.#bots);
    writeFileSync(`database/logs/${pair}.log`, "");
    writeFileSync(`database/prices/${pair}.json`, "[]");
  }
  static update(pair, info) {
    this.#bots[pair].stop();
    this.#bots[pair] = new Bot(info, new SwingTrader(ex, pair, info));
    this.state.update(this.#bots);
  }
  static remove(pair) {
    this.#bots[pair].stop();
    delete this.#bots[pair];
    this.state.update(this.#bots);
  }
  static run(pair) {
    this.#bots[pair].start();
  }
  static stop(pair) {
    this.#bots[pair].stop();
  }
  static async sellAllOrders(pair) {
    await this.#bots[pair].sellAll();
  }
  static resetState(pair) {
    if (this.#bots[pair]) {
      this.#bots[pair].trades = [];
      return;
    }
    for (const p in this.#bots) {
      this.#bots[p].trades = [];
    }
    this.state.update(this.#bots);
  }
  static async runAll() {
    const delayTime = Math.min(6000, (5 * 60 * 1000) / Object.keys(this.#bots).length);
    for (const pair in this.#bots) {
      if (!this.#bots[pair].startedOn) {
        await delay(delayTime);
        this.#bots[pair].start();
      }
    }
  }
  static stopAll() {
    for (const pair in this.#bots) {
      this.#bots[pair].stop();
    }
  }

  static updateBotProgress(pair, event, info) {
    if (event == "LOG") {
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

    if (event == "BUY") this.#bots[pair].orders.push(info);
    else if (event == "SELL") {
      this.#bots[pair].trades.push(info.profit);
      this.#bots[pair].orders = !info.id ? [] : this.#bots[pair].orders.filter((id) => id != info.id);
    } else if (event == "BALANCE") {
      this.#bots[pair].balance = info;
    } else if (event == "STRATEGY") {
      this.#bots[pair].strategy = info.strategy;
      this.#bots[pair].strategyTimestamp = 0;
    }

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
    this.timeInterval = +this.#parseValue(info.timeInterval);
    this.capital = +this.#parseValue(info.capital);
    this.mode = this.#parseValue(info.mode);
    this.balance = +this.#parseValue(info.balance) || 0;
    this.trades = this.#parseValue(info.trades) || [];
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

  sellAll() {
    return this.#trader.sellAll();
  }
  start() {
    this.startedOn = dateToString();
    this.#trader.start();
  }
  stop() {
    this.startedOn = null;
    this.#trader.stop();
  }
}

BotsManager.loadBots();
console.log("====> Bots are loaded. <====");

module.exports = { BotsManager, Bot };
