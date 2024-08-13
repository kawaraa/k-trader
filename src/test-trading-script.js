// test-trading-script is a analyze-price-history-script
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require("node:fs");
// const KrakenExchangeProvider = require("./kraken-ex-provider.js");

// const kraken = new KrakenExchangeProvider(require("../.env.json").KRAKEN_CREDENTIALS);
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");

const pair = process.argv[2]; // The pair of the two currency that will be used for trading E.g. ETHEUR
const capital = +process.argv[3] || 100; // Amount in EUR which is the total money that can be used for trading
const investment = +process.argv[4] || 10; // Amount in EUR that will be used every time to by crypto
const priceChange = +process.argv[5] || 1.5; // price Percentage Threshold 0 to 100, default is 1.5
const strategyRange = +process.argv[6] || 0.5; // Range of the strategy in days, Default is 0.5 day
const testPeriod = +process.argv[7] || 30; // Number of days that will be tested
const pricesLimitOffset = (strategyRange * 24 * 60) / 5;
const pricesFilePath = `${process.cwd()}/database/test/${pair}-prices.json`;

// const cryptos = require(`./currencies.json`);
// const cryptos = [pair];

(async () => {
  // for (let pair of cryptos) {
  //   const filePath = `${process.cwd()}/database/test/${pair}-prices.json`;

  //   if (!existsSync(filePath)) {
  //     writeFileSync(filePath, JSON.stringify(await kraken.prices(pair, 60)));
  //     console.log(pair);
  //   }
  // }

  // ====> Part 2
  // const strategySettings = getStrategySettings();
  // const capital = 100;
  // // let strategyRage =  0.25;
  // let strategyRage = +process.argv[3] || 0.25;

  // for (const pair of cryptos) {
  //   console.log(`Started new analysis with ${pair}.\n`);
  //   const filePath = `${process.cwd()}/database/test/${pair}-prices.json`;
  //   const prices = JSON.parse(readFileSync(filePath, "utf8"));
  //   const result = { investment: 0, priceChange: 0, range: 0, balance: 0 };

  //   try {
  //     for (const [investment, priceChange] of strategySettings) {
  //       let range = strategyRage;

  //       while (range < 6) {
  //         const pricesOffset = (range * 24 * 60) / 5;
  //         const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, pricesOffset);
  //         const info = { capital, investment, priceChange, strategyRange: range };
  //         const trader = new DailyTrader(ex, pair, info);
  //         trader.listener = (p, event, info) => {
  //           event == "sell" && ex.removeOrder(info);
  //         };

  //         for (const i in prices) {
  //           if (i < pricesOffset || prices.length - pricesOffset <= i) continue;
  //           await trader.start();
  //         }

  //         const eur = +(await ex.balance()).eur.toFixed(2);

  //         if (eur > 200 && (result.balance <= eur || (range > 1 && result.balance <= eur + 10))) {
  //           result.balance = eur;
  //           result.range = range;
  //           result.investment = investment;
  //           result.priceChange = priceChange;
  //           console.log(
  //             `Strategy: ${result.investment}, ${result.priceChange}, ${result.range} -`,
  //             "Balance: ",
  //             result.balance,
  //             "=> ",
  //             +((result.balance - 100) / 2).toFixed(2)
  //           );
  //         }

  //         range = range < 0.5 ? 0.5 : range + 0.5;
  //       }
  //     }
  //   } catch (error) {
  //     console.log("Error with ", pair, "===>", error);
  //   }
  //   console.log(`\n\n`);
  // }

  // ====> Part 3

  // Command example: [command] > database/test.log 2>&1
  // node test-trading-script.js XETHZEUR 5000 2500 1.3 10 96 90
  // node test-trading-script.js ADAEUR 100 10 1.5 0.5 8 30

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

// function getStrategySettings() {
//   return [
//     [9, 2],
//     [9, 3],
//     [9, 4],
//     [9, 5],
//     [9, 6],
//     [9, 7],
//     [9, 8],
//     [9, 9],
//     [9, 10],
//     [9, 11],
//     [9, 12],
//     [9, 13],
//     [19, 2],
//     [19, 3],
//     [19, 4],
//     [19, 5],
//     [19, 6],
//     [19, 7],
//     [19, 8],
//     [19, 9],
//     [19, 10],
//     [19, 11],
//     [19, 12],
//     [19, 13],
//     [32, 2],
//     [32, 3],
//     [32, 4],
//     [32, 5],
//     [32, 6],
//     [32, 7],
//     [32, 8],
//     [32, 9],
//     [32, 10],
//     [32, 11],
//     [32, 12],
//     [32, 13],
//     [49, 2],
//     [49, 3],
//     [49, 4],
//     [49, 5],
//     [49, 6],
//     [49, 7],
//     [49, 8],
//     [49, 9],
//     [49, 10],
//     [49, 11],
//     [49, 12],
//     [49, 13],
//     [99, 2],
//     [99, 3],
//     [99, 4],
//     [99, 5],
//     [99, 6],
//     [99, 7],
//     [99, 8],
//     [99, 9],
//     [99, 10],
//     [99, 11],
//     [99, 12],
//     [99, 13],
//   ];
// }
