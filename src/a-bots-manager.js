import { createRequire } from "module";
const require = createRequire(import.meta.url);
import KrakenExchangeProvider from "./providers/kraken-ex-provider.js";
import LocalState from "./local-state.js";
// import notificationProvider from "./providers/notification-provider.js";
// import eventEmitter from "./event-emitter.js";

export default class BotsManager {
  #tradableAssets;
  #bots;
  // state = state;

  constructor() {
    this.#tradableAssets = {};
    this.period = 10;
    this.state = new LocalState("state");
    this.ex = new KrakenExchangeProvider(require("../.env.json").KRAKEN_CREDENTIALS, this.state);
  }

  start() {
    this.run()
      .catch((error) => this.updateBotProgress(null, "LOG", `Error running bot: ${error}`))
      .finally(() => (this.timeoutID = setTimeout(() => this.start(), this.period * 1000)));
  }
  stop() {
    clearTimeout(this.timeoutID);
  }

  async run() {
    try {
      const tradableAssets = await this.ex.getTradableAssetPrices("EUR");
      const pairs = Object.keys(tradableAssets);
      // console.log(tradableAssets);
      // await tradableAssets.map(()=>"")
      // new SmartTrader();
      console.log(`========> ${pairs.length} Assets are monitored`);
    } catch (error) {
      this.updateBotProgress(null, "LOG", `Error running bot: ${error}`);
    }
  }

  updateBotProgress(pair, event, info) {
    if (event == "LOG") {
      console.log(info);
      // const filePath = `database/logs/${pair}.log`;

      // if (!info) info = "\n";
      // else info = `[${toShortDate()}] ${info}\n`;

      // if (!existsSync(filePath)) writeFileSync(filePath, info);
      // else {
      //   // if file less then 500 KB append logs to file, else, overwrite the old logs
      //   const fileSizeInKB = statSync(filePath).size / 1024; // Convert size from B to KB
      //   fileSizeInKB < 500 ? appendFileSync(filePath, info) : writeFileSync(filePath, info);
      // }
      // eventEmitter.emit(`${pair}-log`, { log: info });
    } else {
      // if (event == "BALANCE") this.#bots[pair].balance = info;
      // else if (event == "BUY_SIGNAL") {
      //   const title = `BUY Signal for ${pair}`;
      //   const body = `Price: ${info} Time: ${toShortDate()}`;
      //   notificationProvider.push({ title, body });
      // } else if (event == "BUY") {
      //   this.#bots[pair].position = info;
      //   notificationProvider.push({ title: `Bought ${pair}`, body: `Placed buy position` });
      // } else if (event == "SELL") {
      //   this.#bots[pair].position = null;
      //   this.#bots[pair].trades.push(info);
      //   const body = `Placed sell position with profit/loss ${info}`;
      //   notificationProvider.push({ title: `Sold ${pair}`, body });
      // }
      // this.state.update(this.#bots);
    }
  }
}
