// test-trading-script is a price-history-analysis-script
const { readFileSync } = require("fs");
const { adjustPrice, countPriceChanges } = require("./trend-analysis.js");
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");
const currencies = require("./currencies.json");
const modes = [
  "high-drop",
  "near-low",
  "high-drop-partly-trade",
  "high-drop-slowly-trade",
  "near-low-partly-trade",
  "near-low-slowly-trade",
  "on-increase",
];

// const pair = process.argv[2]; // The pair of the two currency that will be used for trading E.g. ETHEUR
const capital = +process.argv[3] || 100; // Amount in EUR which is the total money that can be used for trading
const investment = +process.argv[4] || 10;
const minStrategyRange = +process.argv[5] || 0.25; // Is a Range of the strategy in days, min value from 0.25 day which equivalent to 6 hours
const minPercentagePriceChange = +process.argv[6] || 1.5;
const mode = process.argv[7] || modes[0];
// const strategyInvestments = [9, 19, 32, 49, 99]; // strategySettings
// investment is and investing Amount in EUR that will be used every time to by crypto
// priceChange is a price Percentage Threshold, value from 0 to 100
const timeInterval = (process.env.botTimeInterval = 5);

// Command example: node test-trading-script.js ETHEUR 100 99 0.25 1.1 near-low > database/log/all.log 2>&1

if (!modes.includes(mode)) throw new Error("Invalid mode!");

const pairs = Object.keys(currencies); // .slice();

(async () => {
  for (const pair of pairs) {
    console.log(`Started new trading with ${pair}:`);
    if (currencies[pair].note?.includes("stable")) continue;
    // const offset = parseInt((minStrategyRange * 24 * 60) / 5);
    // const result = countPriceChanges(prices, minPercentagePriceChange, offset);
    // if (result.changes.at(-1) < 1) result.changes.pop();
    // const pricesChanges = result.changes.filter((p) => p < -1).length / 2;
    // const profit = parseInt(minPercentagePriceChange * pricesChanges);
    // console.log("Prices:", prices.length, "PricesChanges:", pricesChanges, "Profit:", profit);

    try {
      let prices = JSON.parse(readFileSync(`${process.cwd()}/database/prices/${pair}.json`, "utf-8"));
      // prices = prices.slice(0, Math.round(prices.length / 2)); // month 1
      // prices = prices.slice(-Math.round(prices.length / 2)); // month 2

      // let prices = require(`${process.cwd()}/database/test-prices/${pair}.json`);
      // const askBidSpread = currencies[pair].askBidSpreadPercentage; //the prices difference percent between ask and bid prices
      // if (!prices[0]?.tradePrice) prices = prices.map((p) => adjustPrice(p, askBidSpread));

      let maxBalance = 0;
      for (let range = minStrategyRange; range <= 1; range += 0.25) {
        for (let priceChange = minPercentagePriceChange; priceChange <= 9; priceChange += 0.5) {
          const result = await testStrategy(pair, prices, capital, investment, range, priceChange);
          const remain = parseInt(result.crypto);
          const transactions = parseInt(result.transactions / 2);

          if (maxBalance < result.balance + 3) {
            maxBalance = result.balance;
            console.log(
              `€${capital} €${result.investment} >${result.range}< ${result.priceChange}% ${mode} =>`,
              `€${parseInt(result.balance - capital) / 2} Remain: ${remain / 2} Transactions: ${transactions}`
            );
          }
        }
      }
    } catch (error) {
      console.log("Error with ", pair, "=>", error);
    }
    console.log(`\n`);

    // if (global.gc) global.gc(); // Forces garbage collection
  }
})();

async function testStrategy(pair, prices, capital, investment, range, priceChange) {
  let transactions = 0;
  const pricesOffset = (range * 24 * 60) / timeInterval;
  const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, pricesOffset);
  const info = { capital, investment, strategyRange: range, priceChange, mode };
  const trader = new DailyTrader(ex, pair, info);
  trader.listener = (p, event, info) => {
    if (event == "sell") {
      ex.removeOrder(info);
      transactions++;
    }
    // event == "log" && console.log(pair, info);
  };

  for (const i in prices) {
    if (i < pricesOffset || prices.length - pricesOffset <= i) continue;
    await trader.start();
  }
  const crypto = (await ex.balance()).crypto + 0;
  if (crypto > 0) await ex.createOrder("sell", "", "", crypto);

  return {
    investment,
    priceChange,
    range,
    balance: +(await ex.balance()).eur.toFixed(2),
    crypto,
    transactions,
  };
}
