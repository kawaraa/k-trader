const { readdirSync, readFileSync, writeFileSync } = require("node:fs");

const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");

const folderPath = `${process.cwd()}/data`;
const previousPricesLimit = 12; // 12 upto 60 hours

// Get supported cryptocurrencies
const files = readdirSync(`${process.cwd()}/data`);
(async () => {
  for (const file of files) {
    const prices = JSON.parse(readFileSync(`${folderPath}/${file}`, "utf8")).last30DaysPrices;
    const pair = file.replace(".json", "");
    if (pair != "BRICKEUR") continue;
    const sorted = prices.toSorted();
    console.log("The lowest price: ", sorted[0], "The highest price: ", sorted[sorted.length - 1]);

    const testExchange = new TestExchangeProvider({ eur: 100, crypto: 0 }, prices, previousPricesLimit);
    const trader = new DailyTrader("test", testExchange, pair, "average-price", 1.5, 10, 8); // average, highest

    writeFileSync(`database/test-state.json`, "");
    const pricesLimitOffset = (previousPricesLimit * 60) / 5;

    for (const i in prices) {
      if (i < pricesLimitOffset || prices.length - pricesLimitOffset <= i) continue;
      await trader.start();
    }
  }
})();
