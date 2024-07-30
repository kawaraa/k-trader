const { readdirSync, readFileSync, writeFileSync } = require("node:fs");

const TestExchangeProvider = require("./test-ex-provider.js");
const analyzer = require("./trend-analysis.js");
const DailyTrader = require("./daily-trader.js");

const folderPath = `${process.cwd()}/data`;
const oscillatorOffset = 96;

// Get supported cryptocurrencies
const files = readdirSync(`${process.cwd()}/data`);
(async () => {
  for (const file of files) {
    const prices = JSON.parse(readFileSync(`${folderPath}/${file}`, "utf8")).last30DaysPrices;
    const pair = file.replace(".json", "");
    // const numberOfDailyPrices = Math.ceil(prices.length / monthDays);
    console.log("=====>", pair);

    const testExchange = new TestExchangeProvider({ eur: 100, crypto: 0 }, prices, oscillatorOffset);
    const trader = new DailyTrader("test", testExchange, pair, "highest-price", 1.5, 10, 12); // average-price
    writeFileSync(`database/test-state.json`, "");

    for (const i in prices) {
      if (i < oscillatorOffset || i > prices.length - oscillatorOffset) continue;
      await trader.start();
      // if (i > 100) break;
    }

    break;
  }
})();
