import { createRequire } from "module";
const require = createRequire(import.meta.url);
import KrakenExchangeProvider from "./providers/kraken-ex-provider.js";
import notificationProvider from "./providers/notification-provider.js";
import BasicTrader from "./trader/basic-trader.js";
import AdvanceTrader from "./trader/advance-trader.js";
import { existsSync, writeFileSync, statSync, appendFileSync } from "node:fs";
import { dateToString, toShortDate, delay } from "./utilities.js";
import LocalState from "./local-state.js";
import ScalpTrader from "./trader/scalp-trader.js";

const state = new LocalState("state");

const ex = new KrakenExchangeProvider(require("../.env.json").KRAKEN_CREDENTIALS, state);

export class BotsManager {
  static #bots = {};
  static state = state;

  static loadBots() {
    const bots = this.state.load();
    Object.keys(bots).forEach((p) => {
      this.#bots[p] = new Bot(bots[p], BotsManager.getTrader(p, bots[p]));
    });
  }
  static getEurBalance() {
    return ex.balance("all");
  }
  // static syncBots(bots) {
  //   const pairs = Object.keys(this.get());
  //   const pairsFromFirestore = Object.keys(bots);
  //   if (pairsFromFirestore.length == 0) pairs.forEach((pair) => this.remove(pair));
  //   else {
  //     pairsFromFirestore.forEach((pair) => !this.#bots[pair] && this.add(pair, bots[pair]));
  //     pairs.forEach((pair) => !bots[pair] && this.remove(pair));
  //   }
  //   return this.get();
  // }

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
    this.#bots[pair] = new Bot(info, BotsManager.getTrader(pair, info));
    this.state.update(this.#bots);
    writeFileSync(`database/logs/${pair}.log`, "");
    // writeFileSync(`database/prices/${pair}.json`, "[]");
  }
  static update(pair, info) {
    this.#bots[pair].stop();
    this.#bots[pair] = new Bot(info, BotsManager.getTrader(pair, info));
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
  static async sellAll(pair) {
    await this.#bots[pair].sellAll();
  }
  static resetState(pair) {
    if (this.#bots[pair]) {
      this.#bots[pair].trades = [];
    } else {
      for (const p in this.#bots) {
        this.#bots[p].trades = [];
      }
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
        // if file less then 500 KB append logs to file, else, overwrite the old logs
        const fileSizeInKB = statSync(filePath).size / 1024; // Convert size from B to KB
        fileSizeInKB < 500 ? appendFileSync(filePath, info) : writeFileSync(filePath, info);
      }
    } else {
      if (event == "BALANCE") this.#bots[pair].balance = info;
      else if (event == "BUY_SIGNAL") {
        const title = `BUY Signal for ${pair}`;
        const body = `Price: ${info} Time: ${toShortDate()}`;
        notificationProvider.push({ title, body });
      } else if (event == "BUY") {
        this.#bots[pair].position = info;
        notificationProvider.push({ title: `Bought ${pair}`, body: `Placed buy position` });
      } else if (event == "SELL") {
        this.#bots[pair].position = null;
        this.#bots[pair].trades.push(info);
        const body = `Placed sell position with profit/loss ${info}`;
        notificationProvider.push({ title: `Sold ${pair}`, body });
      }
      this.state.update(this.#bots);
    }
  }

  static getTrader(pair, info) {
    const traders = { basic: BasicTrader, scalp: ScalpTrader, advance: AdvanceTrader };
    const Trader = traders[info.trader] || BasicTrader;
    return new Trader(ex, pair, info);
  }
}

export class Bot {
  #trader;
  constructor(info, trader) {
    this.interval = +this.#parseValue(info.interval);
    this.capital = +this.#parseValue(info.capital);
    this.trader = this.#parseValue(info.trader);
    this.mode = this.#parseValue(info.mode);
    this.balance = +this.#parseValue(info.balance) || 0;
    this.trades = this.#parseValue(info.trades) || [];
    this.position = this.#parseValue(info.position) || null;
    this.createTime = this.#parseValue(info.createTime) || new Date().toISOString();
    this.updateTime = new Date().toISOString();
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
