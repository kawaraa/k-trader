const KrakenExchangeProvider = require("./src/providers/kraken-ex-provider");
const LocalState = require("./src/local-state");
const AdvanceTrader = require("./src/trader/advance-trader");
const IntermediateTrader = require("./src/trader/Intermediate-trader");
const { parseNumInLog } = require("./src/utilities");
const pair = process.argv[2]; //  LTCEUR, SOLEUR, VINEEUR
const advance = process.argv[3]; //  1, 2

const state = new LocalState("state");

const exProvider = new KrakenExchangeProvider(require("./.env.json").KRAKEN_CREDENTIALS, state);

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
if (!advance) {
  trader = new IntermediateTrader(exProvider, pair, { interval: 5, capital: 100, mode: "test" });
}

trader.listener = (pair, event, log) => event == "LOG" && console.log(...parseNumInLog(log));
trader.start();
