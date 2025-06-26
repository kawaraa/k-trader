const env = jsonRequire("src/.env.json");
import eventEmitter from "./event-emitter.js";
import notificationProvider from "./providers/notification-provider.js";
import LocalState from "./local-state.js";
import KrakenExchangeProvider from "./providers/kraken-ex-provider.js";
import SmartTrader from "./trader/smart-trader.js";

export default class TradersManager {
  #tradableAssets;
  #traders;
  constructor() {
    this.state = new LocalState("state");
    this.ex = new KrakenExchangeProvider(env.KRAKEN_CREDENTIALS, this.state);
    this.capital = this.state.data.capital || 0;
    this.interval = this.state.data.interval || 10;
    this.range = parseInt((3 * 60 * 60) / this.interval);
    this.#tradableAssets = {};
    this.#traders = {};
    this.balances = {};
  }

  start() {
    this.run().finally(() => (this.timeoutID = setTimeout(() => this.start(), this.interval * 1000)));
  }
  stop() {
    clearTimeout(this.timeoutID);
  }
  buy(pair, amount) {
    return this.#traders[pair].buy(amount, this.balances.eur, this.#tradableAssets[pair][1], "manually");
  }
  sellAll(pair) {
    return this.#traders[pair].sellAll(this.balances[pair]);
  }

  async run() {
    try {
      this.balances = await this.ex.balance();
      this.#tradableAssets = await this.ex.getTradableAssetPrices("EUR");
      const pairs = Object.keys(this.#tradableAssets);
      console.log(this.#tradableAssets);

      await Promise.all(pairs.map((pair) => this.runTrader(pair, this.balances.eur, this.balances[pair])));
      this.state.update(this.state.data);

      console.log(`========> Started trading ${pairs.length} Cryptocurrencies Assets`);
    } catch (error) {
      this.updateBotProgress(null, "LOG", `Error running bot: ${error}\n`);
    }
  }

  async runTrader(pair, eurBalance, cryptoBalance) {
    const prices = this.state.updateLocalPrices(pair, this.#tradableAssets[pair]).slice(-this.range);
    eventEmitter.emit(`${pair}-price`, { prices: this.#tradableAssets[pair] });

    if (!this.state.data[pair]) this.state.data[pair] = { position: null, trades: [] };
    if (!this.#traders[pair]) {
      this.#traders[pair] = new SmartTrader(this.ex, pair, this.interval);
      this.#traders[pair].listener = (...arg) => this.updateBotProgress(...arg);
    }
    if (prices.length >= this.range / 1.1) {
      const trades = this.state.data[pair].trades;
      await this.#traders[pair].trade(this.capital, prices, eurBalance, cryptoBalance, trades, position);
    }
  }

  updateBotProgress(pair, event, info, tradeCase) {
    const filePath = `database/logs/${pair || "traders-manager"}.log`;
    // console.log(info);
    if (event == "LOG") {
      if (!info) info = "\n";
      else info = `[${toShortDate()}] ${info}\n`;

      if (!existsSync(filePath)) writeFileSync(filePath, info);
      else {
        // if file less then 500 KB append logs to file, else, overwrite the old logs
        const fileSizeInKB = statSync(filePath).size / 1024 / 1024; // Convert size from B to KB to MB
        fileSizeInKB < 1 ? appendFileSync(filePath, info) : writeFileSync(filePath, info);
      }
      eventEmitter.emit(`${pair}-log`, { log: info });
    } else {
      const time = ` Time: ${toShortDate()}`;
      const body = `${tradeCase} at price: ${info?.price || info}`;
      if (event == "BUY_SIGNAL") {
        const title = `BUY Signal for ${pair}`;
        notificationProvider.push({ title, body: body + time });
      } else if (event == "BUY") {
        this.state.data[pair].position = info;
        notificationProvider.push({ title: `Bought ${pair}`, body: body + time });
      } else if (event == "SELL") {
        this.state.data[pair].position = null;
        this.state.data[pair].trades.push(info);
        notificationProvider.push({ title: `Sold ${pair}`, body: `${body} Return: ${info.return} ${time}` });
      }
      this.state.update(this.state.data);
    }
  }
}
