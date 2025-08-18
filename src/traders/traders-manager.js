import { existsSync } from "node:fs";
import { appendFile, stat, writeFile } from "node:fs/promises";
import eventEmitter from "../services/event-emitter.js";
import notificationProvider from "../providers/notification-provider.js";
import getState from "../services/local-state.js";
import KrakenExchangeProvider from "../providers/kraken-ex-provider.js";
import SmartTrader from "./smart-trader.js";
import { calcPercentageDifference, isNumber, toShortDate } from "../../shared-code/utilities.js";
import { spawn } from "node:child_process";
// import { getCryptoTimingSuggestion } from "../../shared-code/indicators.js";

class TradersManager {
  currencies;
  #traders;
  constructor() {
    this.state = getState("traders-state");
    this.ex = new KrakenExchangeProvider(this.state);
    this.defaultCapital = 0;
    this.interval = 10;
    // this.range = parseInt((4 * 60 * 60) / this.interval);
    this.eurBalance = 0;
    this.#traders = {};
    this.autoSell = true;
    this.notifyTimers = {};
  }

  start() {
    this.run().finally(() => (this.timeoutID = setTimeout(() => this.start(), this.interval * 1000)));
  }
  stop() {
    clearTimeout(this.timeoutID);
  }
  buy(pair) {
    return (
      this.#traders[pair] &&
      this.#traders[pair].buy(
        !isNaN(this.state.data[pair].capital) ? this.state.data[pair].capital : this.defaultCapital,
        this.eurBalance,
        this.state.data[pair].price[1],
        "manually"
      )
    );
  }
  sell(pair) {
    if (!this.#traders[pair]) throw new Error(`${pair} Trader is not active`);
    return this.#traders[pair].sellManually(this.state.data[pair].balance);
  }

  async run() {
    try {
      let loadedCurrencies = {};
      if (!(new Date().getHours() == 0 && new Date().getMinutes() == 0)) {
        for (let pair in this.state.data) {
          if (!this.state.data[pair].disabled) loadedCurrencies[pair] = { balance: null, price: null };
        }
      }

      const { eurBalance, currencies } = await this.ex.getTradableAssetPrices("EUR", loadedCurrencies);

      Object.keys(this.state.data).forEach((p) => {
        if (!currencies[p] && !this.state.data[p].disabled) delete this.state.data[p];
      });

      this.eurBalance = eurBalance;
      const pairs = Object.keys(currencies);

      console.log(`🚀 Started trading ${pairs.length} Cryptocurrencies`);

      await Promise.all(
        pairs.map(
          (pair) =>
            !this.state.data[pair]?.disabled && this.state.appendToLocalPrices(pair, currencies[pair].price)
        )
      );
      await Promise.all(
        pairs.map(
          (pair) =>
            !this.state.data[pair].disabled &&
            this.runTrader(pair, eurBalance, currencies[pair].balance, currencies[pair].price)
        )
      );
      await this.state.update(this.state.data);
      this.deleteOldPrices();

      console.log(`✅ Finished trading ${pairs.length} Cryptocurrencies`);
    } catch (error) {
      this.updateBotProgress(null, "LOG", `Error running traders: ${error}\n`);
      console.error(error);
    }
  }

  async runTrader(pair, eur, crypto, price) {
    eventEmitter.emit("price", { [pair]: price });

    if (this.notifyTimers[pair] > 0) this.notifyTimers[pair] -= 1;
    if (!this.state.data[pair]) this.state.data[pair] = new TraderInfo(crypto);
    if (!this.#traders[pair]) {
      this.#traders[pair] = new SmartTrader(this.ex, pair, null, this.state.data[pair]);
      this.#traders[pair].listener = (...arg) => this.updateBotProgress(...arg);
    }

    this.state.data[pair].price = price;
    this.state.data[pair].balance = crypto;

    if (new Date().getHours() == 0 && new Date().getMinutes() == 0) {
      this.state.data[pair].askBidSpread = +(calcPercentageDifference(price[2], price[1]) / 2).toFixed(2);
    }

    if (isNumber(this.state.data[pair].askBidSpread, 0, 1)) {
      const { capital, position, trades } = this.state.data[pair];
      const cpl = !+capital && this.defaultCapital >= 0 ? this.defaultCapital : capital;
      const res = await this.#traders[pair].run(cpl, price, eur, crypto, trades, position, this.autoSell);

      if (res.bigChanges) this.state.data[pair].bigChanges = res.bigChanges;
      if (res.smallChanges) this.state.data[pair].smallChanges = res.smallChanges;
      if (res.trend) this.state.data[pair].trend = res.trend;
      if (res.signal != "unknown") this.state.data[pair].signal = res.signal;
    }
  }

  async updateBotProgress(pair, event, info, tradeCase) {
    const filePath = `database/logs/${pair || "traders-manager"}.log`;

    if (event == "LOG") {
      if (!info) info = "\n";
      else info = `[${toShortDate()}] ${info}\n`;

      if (!existsSync(filePath)) await writeFile(filePath, info);
      else {
        // if file less then 500 KB append logs to file, else, overwrite the old logs
        const fileSizeInKB = (await stat(filePath)).size / 1024 / 1024; // Convert size from B to KB to MB
        fileSizeInKB < 1 ? await appendFile(filePath, info) : await writeFile(filePath, info);
      }

      if (info != "\n") eventEmitter.emit(`${pair}-log`, { log: info });
    } else {
      const notify = !(this.notifyTimers[pair] > 0);
      const time = ` Time: ${toShortDate()}`;
      const body = `${tradeCase} at price: ${info?.price || info}`;
      const url = `/trader?pair=${pair}`;

      if (event == "BUY_SIGNAL") {
        const title = `BUY Signal for ${pair}`;
        if (notify) notificationProvider.push({ title, body: body + time, url });
      } else if (event == "SELL_SIGNAL") {
        const title = `SELL Signal for ${pair}`;
        if (notify) notificationProvider.push({ title, body: body + time, url });
      } else if (event == "BUY") {
        this.state.data[pair].position = info;
        if (notify) notificationProvider.push({ title: `Bought ${pair}`, body: body + time, url });
      } else if (event == "SELL") {
        this.state.data[pair].position = null;
        if (+info > 0 || +info < 0) this.state.data[pair].trades.push(info);
        const payload = { title: `Sold ${pair}`, body: `${body} Return: ${info} ${time}`, url };
        if (notify) notificationProvider.push(payload);
      }

      if (notify) this.notifyTimers[pair] = (60 * 60) / this.interval;

      this.state.update(this.state.data);
    }
  }

  deleteOldPrices() {
    if (new Date().getMinutes() > 0) return; // only the time is Exactly on the Hour
    // Linux/macOS (no shell) - "1,600d" means Delete lines 1 through 600, which is 1hr
    spawn("find", ["database/prices/", "-type", "f", "-exec", "sed", "-i", "1,600d", "{}", ";"], {
      stdio: "inherit", // Prints output to parent console
    });
  }
}

const tradersManager = new TradersManager();
export default tradersManager;

class TraderInfo {
  constructor(crypto) {
    // this.askBidSpread = 0; // this will be undefined for low liquidity asset
    this.capital = 0;
    this.balance = crypto || 0;
    this.position = null;
    this.trades = [];
    this.bigChanges = [[null, null, null, null]];
    this.smallChanges = [[null, null, null, null]];
  }
}
