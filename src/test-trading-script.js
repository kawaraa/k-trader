// test-trading-script is a analyze-price-history-script
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require("node:fs");
const KrakenExchangeProvider = require("./kraken-ex-provider.js");

const kraken = new KrakenExchangeProvider(require("../.env.json").KRAKEN_CREDENTIALS);
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");

const pair = process.argv[2]; // The pair of the two currency that will be used for trading E.g. ETHEUR
const capital = +process.argv[3] || 100; // Amount in EUR which is the total money that can be used for trading
const investment = +process.argv[4] || 10; // Amount in EUR that will be used every time to by crypto
const priceChange = +process.argv[5] || 1.5; // price Percentage Threshold 0 to 100, default is 1.5
const strategyRange = +process.argv[6] || 0.5; // Range of the strategy in days, Default is 0.5 day
// const safetyTimeline = +process.argv[7] || 8; // Number of hours, Default is 8 hours
const testPeriod = +process.argv[7] || 30; // Number of days that will be tested
const pricesLimitOffset = (strategyRange * 24 * 60) / 5;
const pricesFilePath = `${process.cwd()}/database/test/${pair}-prices.json`;

// Command example: [command] > database/test.log 2>&1
// node test-trading-script.js XETHZEUR 5000 2500 1.3 10 96 90
// node test-trading-script.js ADAEUR 100 10 1.5 0.5 8 30

(async () => {
  let prices = [];
  if (existsSync(pricesFilePath)) {
    prices = JSON.parse(readFileSync(pricesFilePath, "utf8"));
  } else {
    prices = await kraken.prices(pair, testPeriod);
    writeFileSync(pricesFilePath, JSON.stringify(prices));
  }

  const sorted = prices.toSorted();
  console.log("The lowest price: ", sorted[0], "The highest price: ", sorted[sorted.length - 1]);

  const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, pricesLimitOffset);
  const info = { capital, investment, priceChange, strategyRange };
  const trader = new DailyTrader(ex, pair, info);
  trader.listener = (pair, event, info) => {
    event == "sell" && ex.removeOrder(info);
    event == "log" && console.log(pair, info);
  };

  for (const i in prices) {
    if (i < pricesLimitOffset || prices.length - pricesLimitOffset <= i) continue;
    await trader.start();
  }
})();
