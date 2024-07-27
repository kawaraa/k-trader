const Kraken = require("./kraken.js");
const analyzer = require("./trend-analysis.js");
const { minMs, delay } = require("./utilities.js");
const kraken = new Kraken(require("../.env.json"));

const days = 30;

// Main function to get average number of significant changes per day
async function getAverageChanges(percentageThreshold) {
  // Get supported cryptocurrencies
  const cryptos = Object.keys(await kraken.publicApi("/AssetPairs"));
  const results = {};
  const date = new Date();
  date.setDate(date.getDate() - 1);

  await delay(1050);

  for (const crypto of cryptos) {
    // Helper function to get historical prices for a cryptocurrency
    // https://api.kraken.com/0/public/OHLC?pair=BTC/EUR&interval=5&since=1719486178

    for (let lastDaysMs = 1; lastDaysMs <= days; lastDaysMs++) {
      date.setDate(date.getDate() - 1);
      console.log(date.getTime());
      let prices = await kraken.getPrices(crypto, 5, date.getTime());
      const changes = analyzer.countPercentageChange(prices, percentageThreshold);
      if (!results[crypto]) results[crypto] = [changes];
      else results[crypto].push(changes);
      console.log(prices.length);

      await delay(1050);
    }
    // console.log(results);
    ss;
    if (prices.length === 0) continue;

    // for (const change of changes) {
    //   if (Math.abs(change) >= PERCENTAGE_THRESHOLD) {
    //     significantChangeCount++;
    //   }
    // }

    // const averageChangesPerDay = significantChangeCount / DAYS;
    // results.push({ crypto, averageChangesPerDay });
  }

  return results;
}

getAverageChanges(1.4);
