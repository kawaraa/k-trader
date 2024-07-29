const { readFileSync, appendFileSync, writeFileSync } = require("node:fs");

const cryptocurrencies = require("../data/cryptocurrencies.json");
const Kraken = require("./kraken.js");
const analyzer = require("./trend-analysis.js");
const { delay } = require("./utilities.js");
const kraken = new Kraken(require("../.env.json"));
const days = 30;

// Main function to get average number of significant changes per day
async function getAverageChanges(percentageThreshold) {
  // Get supported cryptocurrencies
  const cryptos = await kraken.publicApi("/AssetPairs");
  const eurPairs = {};

  for (const pair in cryptos) {
    if (cryptocurrencies[pair]) eurPairs[pair] = [];
  }

  await delay(1050);

  for (const pair in eurPairs) {
    // Helper function to get historical prices for a cryptocurrency
    // https://api.kraken.com/0/public/OHLC?pair=BTC/EUR&interval=5&since=1719486178
    if (!cryptocurrencies[pair]) continue;

    const data = { first: cryptocurrencies[pair], last30DaysPrices: [] };
    let lastTimestamp = 0;
    let lastDays = 0;
    console.log(`${pair}:`);

    while (lastDays <= days) {
      let prices = await kraken.getPrices(pair, 5, lastTimestamp); //.slice(-120) last 24 hours
      lastTimestamp = prices[0][0]; // The oldest timestamp in the retrieved data
      prices = kraken.cleanPrices(prices);
      data.last30DaysPrices = prices.concat(data.last30DaysPrices);
      lastDays += (Date.now() / 1000 - lastTimestamp) / 60 / 60 / 24;

      // const changes = analyzer.countPercentageChange(prices, percentageThreshold);
      // if (!results[pair]) results[pair] = [changes];
      // else results[pair].push(changes);

      await delay(5000);
    }
    writeFileSync(`${process.cwd()}/data/${pair}.json`, JSON.stringify(data, null, 2));

    // for (const change of changes) {
    //   if (Math.abs(change) >= PERCENTAGE_THRESHOLD) {
    //     significantChangeCount++;
    //   }
    // }

    // const averageChangesPerDay = significantChangeCount / DAYS;
    // results.push({ pair, averageChangesPerDay });
  }

  // return results;
}

getAverageChanges(1.4);
