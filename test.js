const KrakenExchangeProvider = require("./src/providers/kraken-ex-provider");
const LocalState = require("./src/local-state");

const state = new LocalState("state");

const ex = new KrakenExchangeProvider(require("./.env.json").KRAKEN_CREDENTIALS, state);

ex.getOpenClosedOrders("open")
  .then(async (order) => {
    const id = Object.keys(order)[0];
    const { descr, vol } = order[id];
    // const res = await ex.editOrder(id, descr.pair, "70", vol);
    // console.log(res);
    console.log(order);
  })
  .catch(console.log);
