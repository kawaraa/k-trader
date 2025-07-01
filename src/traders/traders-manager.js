import { appendFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import eventEmitter from "../services/event-emitter.js";
import notificationProvider from "../providers/notification-provider.js";
import LocalState from "../services/local-state.js";
import KrakenExchangeProvider from "../providers/kraken-ex-provider.js";
import SmartTrader from "./smart-trader.js";
import { calcAveragePrice, isNumber, toShortDate } from "../../shared-code/utilities.js";

class TradersManager {
  currencies;
  #traders;
  constructor() {
    this.state = new LocalState("traders-state");
    this.ex = new KrakenExchangeProvider(process.env.KRAKEN_CREDENTIALS, this.state);
    this.defaultCapital = 0;
    this.interval = 10;
    this.range = parseInt((3 * 60 * 60) / this.interval);
    this.balances = {};
    this.currencies = {};
    this.#traders = {};
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
        this.balances.eur,
        this.currencies[pair][1],
        "manually"
      )
    );
  }
  sell(pair) {
    return this.#traders[pair] && this.#traders[pair].sellManually(this.balances[pair]);
  }

  async run() {
    try {
      const { balances, currencies } = await this.ex.getTradableAssetPrices("EUR");
      this.balances = balances;
      this.currencies = currencies;
      const pairs = Object.keys(currencies);

      await Promise.all(pairs.map((pair) => this.runTrader(pair, this.balances.eur, this.balances[pair])));
      this.state.update(this.state.data);

      console.log(`========> Started trading ${pairs.length} Cryptocurrencies Assets`);
    } catch (error) {
      this.updateBotProgress(null, "LOG", `Error running traders: ${error}\n`);
    }
  }

  async runTrader(pair, eurBalance, cryptoBalance) {
    if (this.notifyTimers[pair] > 0) this.notifyTimers[pair] -= 1;
    const prices = this.state.updateLocalPrices(pair, this.currencies[pair]).slice(-this.range);
    eventEmitter.emit("price", { [pair]: this.currencies[pair] });
    if (!this.state.data[pair]) this.state.data[pair] = new TraderInfo();
    if (!this.#traders[pair]) {
      this.#traders[pair] = new SmartTrader(this.ex, pair, this.interval);
      this.#traders[pair].listener = (...arg) => this.updateBotProgress(...arg);
    }

    // const skip = !isNumber(this.state.data[pair].askBidSpread, 0, 1) || prices.at(-1)[3] / 1000000 < 0.5;
    if (prices.length >= this.range / 1.1 && isNumber(this.state.data[pair].askBidSpread, 0, 1)) {
      const { capital, position, trades } = this.state.data[pair];
      const cpl = !isNaN(capital) ? capital : this.defaultCapital;
      await this.#traders[pair].trade(cpl, prices, eurBalance, cryptoBalance, trades, position);
    }
  }

  updateBotProgress(pair, event, info, tradeCase) {
    const filePath = `database/logs/${pair || "traders-manager"}.log`;

    if (event == "LOG") {
      if (!info) info = "\n";
      else info = `[${toShortDate()}] ${info}\n`;

      if (!existsSync(filePath)) writeFileSync(filePath, info);
      else {
        // if file less then 500 KB append logs to file, else, overwrite the old logs
        const fileSizeInKB = statSync(filePath).size / 1024 / 1024; // Convert size from B to KB to MB
        fileSizeInKB < 1 ? appendFileSync(filePath, info) : writeFileSync(filePath, info);
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
      } else if (event == "BUY") {
        this.state.data[pair].position = info;
        if (notify) notificationProvider.push({ title: `Bought ${pair}`, body: body + time, url });
      } else if (event == "SELL") {
        this.state.data[pair].position = null;
        this.state.data[pair].trades.push(info);
        const payload = { title: `Sold ${pair}`, body: `${body} Return: ${info.return} ${time}`, url };
        if (notify) notificationProvider.push(payload);
      }

      if (notify) this.notifyTimers[pair] = (60 * 60) / 10;

      this.state.update(this.state.data);
    }
  }
}

const tradersManager = new TradersManager();
export default tradersManager;

class TraderInfo {
  constructor() {
    // this.askBidSpread = 0; // this will be undefined for low liquidity asset
    this.capital = 0;
    this.balances = 0;
    this.position = null;
    this.trades = [];
  }
}
