const { readdirSync, readFileSync, writeFileSync } = require("node:fs");

const TestExchangeProvider = require("./test-ex-provider.js");
const analyzer = require("./trend-analysis.js");
const DailyTrader = require("./daily-trader.js");

const folderPath = `${process.cwd()}/data`;
const oscillatorOffset = 96;

// Get supported cryptocurrencies
const files = readdirSync(`${process.cwd()}/data`);

for (const file of files) {
  const prices = JSON.parse(readFileSync(`${folderPath}/${file}`, "utf8")).last30DaysPrices;
  const pair = file.replace(".json", "");
  // const numberOfDailyPrices = Math.ceil(prices.length / monthDays);

  const testExchange = new TestExchangeProvider({ eur: 100, crypto: 0 }, prices, oscillatorOffset);
  const trader = new DailyTrader("test", testExchange, pair, "highest-price", 1.5, 10); // average-price
  writeFileSync(`database/test-state.json`, "");

  for (const i in prices) {
    if (i < oscillatorOffset) continue;
    trader.start();
  }

  break;
}
