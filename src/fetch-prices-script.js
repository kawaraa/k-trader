// fetch-prices-script
const { writeFileSync } = require("node:fs");
const Kraken = require("./kraken-ex-provider.js");
const { delay } = require("./utilities.js");

const kraken = new Kraken(require("../.env.json"));
const days = 30;

async function getAverageChanges() {
  const cryptos = await kraken.publicApi("/AssetPairs");
  const crypto = "ADAEUR";

  for (const pair in cryptos) {
    if (pair == crypto) console.log(pair);
  }

  await delay(1050);

  const data = { first: "", last30DaysPrices: [] };
  let lastTimestamp = 0;
  let lastDays = 0;

  // while (lastDays <= days) {
  //   let prices = await kraken.pricesData(crypto, 5, lastTimestamp); //.slice(-120) last 24 hours
  //   lastTimestamp = prices[0][0]; // The oldest timestamp in the retrieved data
  //   prices = prices.map((candle) => parseFloat(candle[4]));
  //   data.last30DaysPrices = prices.concat(data.last30DaysPrices);
  //   lastDays += (Date.now() / 1000 - lastTimestamp) / 60 / 60 / 24;

  //   await delay(5000);
  // }
  // writeFileSync(`${process.cwd()}/data/${crypto}.json`, JSON.stringify(data, null, 2));
}

getAverageChanges();
