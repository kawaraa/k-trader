const env = jsonRequire(".env.json");
import KrakenExchangeProvider from "./src/providers/kraken-ex-provider.js";
import LocalState from "./src/local-state.js";
import AdvanceTrader from "./src/trader/advance-trader.js";
import { parseNumInLog } from "./src/utilities.js";
import ScalpTrader from "./src/trader/scalp-trader.js";
const pair = process.argv[2]; //  LTCEUR, SOLEUR, VINEEUR
const scalp = process.argv.includes("scalp"); //  1, 2

const state = new LocalState("state");
const exProvider = new KrakenExchangeProvider(env.KRAKEN_CREDENTIALS, state);

// ex.getOpenClosedOrders("open")
//   .then(async (order) => {
//     const id = Object.keys(order)[0];
//     const { descr, vol } = order[id];
//     // const res = await ex.editOrder(id, descr.pair, "70", vol);
//     // console.log(res);
//     console.log(order);
//   })
//   .catch(console.log);

let trader = new AdvanceTrader(exProvider, pair, { interval: 5, capital: 100, mode: "test" });
if (scalp) {
  trader = new ScalpTrader(exProvider, pair, { interval: 5, capital: 100, mode: "test" });
}

trader.listener = (pair, event, log) => event == "LOG" && console.log(...parseNumInLog(log));
trader.start();
