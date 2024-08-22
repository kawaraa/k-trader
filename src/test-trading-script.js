// test-trading-script is a price-history-analysis-script
const { existsSync, readFileSync, writeFileSync, unlinkSync } = require("node:fs");
const KrakenExchangeProvider = require("./kraken-ex-provider.js");

const kraken = new KrakenExchangeProvider(require("../.env.json").KRAKEN_CREDENTIALS);
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");

const pair = process.argv[2]; // The pair of the two currency that will be used for trading E.g. ETHEUR
const minStrategyRange = process.argv[3] || 0.25; // Is a Range of the strategy in days, min value from 0.25 day which equivalent to 6 hours
const capital = +process.argv[4] || 100; // Amount in EUR which is the total money that can be used for trading
const minTestPeriod = +process.argv[5] || 60; // Number of days that will be tested
const cryptos = pair ? { [pair]: pair } : require(`./currencies.json`).other;

// Command example: node test-trading-script.js ETHEUR 100 60 > database/log/all.log 2>&1
//

(async () => {
  const strategySettings = getStrategySettingsMatrix();
  let strategyRage = minStrategyRange;

  for (const pair in cryptos) {
    console.log(`Started new analysis with ${pair}.\n`);

    const filePath = `${process.cwd()}/database/prices/${pair}.json`;
    const result = { investment: 0, priceChange: 0, range: 0, balance: 0 };
    let prices = [];

    if (existsSync(filePath)) {
      // prices = JSON.parse(readFileSync(filePath, "utf8"));
      prices = (await kraken.pricesData(pair, minTestPeriod)).map((candle) => {
        const closingPrice = parseFloat(candle[4]);
        return { tradePrice: closingPrice, askPrice: closingPrice * 1.001, bidPrice: closingPrice * 0.999 };
      });
    } else {
      console.log(`No prices file is found for ${pair}`);
      // prices = (await kraken.pricesData(pair, minTestPeriod)).map((candle) => {
      //   const closingPrice = parseFloat(candle[4]);
      //   return { tradePrice: closingPrice, askPrice: closingPrice * 1.001, bidPrice: closingPrice * 0.999 };
      // });
      // writeFileSync(filePath, JSON.stringify(prices));
    }

    // const sorted = prices.toSorted();
    // console.log("The lowest price: ", sorted[0], "The highest price: ", sorted[sorted.length - 1]);

    try {
      for (const [investment, priceChange] of strategySettings) {
        // investment is and investing Amount in EUR that will be used every time to by crypto
        // priceChange is a price Percentage Threshold, value from 0 to 100
        let range = strategyRage;

        while (range < 3) {
          const pricesOffset = (range * 24 * 60) / 5;
          const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, pricesOffset);
          const info = { capital, investment, priceChange, strategyRange: range };
          const trader = new DailyTrader(ex, pair, info);
          trader.listener = (p, event, info) => {
            event == "sell" && ex.removeOrder(info);
            //  event == "log" && console.log(pair, info);
          };

          for (const i in prices) {
            if (i < pricesOffset || prices.length - pricesOffset <= i) continue;
            await trader.start();
          }

          await ex.createOrder("sell", "", "", (await ex.balance()).crypto);
          const eur = +(await ex.balance()).eur.toFixed(2);

          if (200 <= eur && result.balance <= eur) {
            result.balance = eur;
            result.range = range;
            result.investment = investment;
            result.priceChange = priceChange;
            console.log(
              `Strategy: ${result.investment}, ${result.priceChange}, ${result.range} -`,
              "Balance: ",
              result.balance,
              "=> ",
              +((result.balance - 100) / 2).toFixed(2)
            );
          }

          range = range < 0.5 ? 0.5 : range + 0.5;
        }
      }
    } catch (error) {
      console.log("Error with ", pair, "===>", error);
    }
    console.log(`\n\n`);
  }
})();

function getStrategySettingsMatrix() {
  return [
    [9, 1.5],
    [9, 2],
    [9, 3],
    [9, 4],
    [9, 5],
    [9, 6],
    [9, 7],
    [9, 8],
    [9, 9],
    [9, 10],
    [19, 1.5],
    [19, 2],
    [19, 3],
    [19, 4],
    [19, 5],
    [19, 6],
    [19, 7],
    [19, 8],
    [19, 9],
    [19, 10],
    // [32, 2],
    // [32, 3],
    // [32, 4],
    // [32, 5],
    // [32, 6],
    // [32, 7],
    // [32, 8],
    // [32, 9],
    // [32, 10],
    // [32, 11],
    // [32, 12],
    // [32, 13],
    // [49, 2],
    // [49, 3],
    // [49, 4],
    // [49, 5],
    // [49, 6],
    // [49, 7],
    // [49, 8],
    // [49, 9],
    // [49, 10],
    // [49, 11],
    // [49, 12],
    // [49, 13],
    // [99, 2],
    // [99, 3],
    // [99, 4],
    // [99, 5],
    // [99, 6],
    // [99, 7],
    // [99, 8],
    // [99, 9],
    // [99, 10],
    // [99, 11],
    // [99, 12],
    // [99, 13],
  ];
}
