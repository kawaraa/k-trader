const KrakenExchangeProvider = require("./kraken-ex-provider");
const DailyTrader = require("./daily-trader");
const { existsSync, writeFileSync, statSync, appendFileSync } = require("node:fs");
const { dateToString, toShortDate, delay } = require("./utilities");
const LocalState = require("./local-state");

const state = new LocalState("state");
const ex = new KrakenExchangeProvider(require("../.env.json").KRAKEN_CREDENTIALS, state);

class BotsManager {
  static #bots = {};
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
    writeFileSync(`database/logs/${pair}.log`, "");
    writeFileSync(`database/prices/${pair}.json`, "[]");
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
    this.#bots[pair].start();
  }
  static stop(pair) {
    this.#bots[pair].stop();
  }
  static async sellAllOrders(pair) {
    await this.#bots[pair].sellAll();
    this.#bots[pair].sold += 1;
    this.#bots[pair].orders = [];
    this.state.update(this.get());
  }
  static restState(pair) {
    if (this.#bots[pair]) {
      this.#bots[pair].sold = 0;
      this.#bots[pair].earnings = 0;
      return;
    }
    for (const p in this.#bots) {
      this.#bots[p].sold = 0;
      this.#bots[p].earnings = 0;
    }
    this.state.update(this.#bots);
  }
  static async runAll() {
    for (const pair in this.#bots) {
      if (!this.#bots[pair].startedOn) {
        await delay(4000);
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

    if (event == "buy") {
      this.#bots[pair].bought += 1;
      this.#bots[pair].orders.push(info);
    } else if (event == "sell") {
      this.#bots[pair].sold += 1;
      this.#bots[pair].orders = this.#bots[pair].orders.filter((id) => id != info);
    } else if (event == "earnings") this.#bots[pair].earnings += info;
    else if (event == "balance") this.#bots[pair].balance = info;

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
