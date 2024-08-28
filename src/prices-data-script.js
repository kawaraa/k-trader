const { existsSync, writeFileSync } = require("node:fs");
const { request, delay } = require("./utilities");

const pair = process.argv[2];
const minTestPeriod = +process.argv[3] || 60; // Number of days that will be tested
const cryptocurrencies = pair ? { [pair]: pair } : require(`./currencies.json`);

(async () => {
  for (const pair in cryptocurrencies) {
    const filePath = `${process.cwd()}/database/test-prices/${pair}.json`;

    if (existsSync(filePath)) {
      console.log(`The prices file for ${pair} already exists.\n`);
      console.log(JSON.stringify(await getBinanceData(pair, minTestPeriod)));
    } else {
      writeFileSync(filePath, JSON.stringify(await getBinanceData(pair, minTestPeriod)));
      console.log(`Finished fetching prices for ${pair}`);
    }
  }
})();

async function getBinanceData(pair, days = 0.5, interval = "5m") {
  const baseUrl = "https://api.binance.com/api/v3/klines";
  const limit = 1000; // Binance allows up to 1000 candles per request
  const endTime = Date.now(); // Current time in milliseconds
  const startTime = endTime - days * 24 * 60 * 60 * 1000; // Start time 60 days ago
  const allPrices = [];
  let fetchTime = endTime;

  while (fetchTime > startTime) {
    const url = `${baseUrl}?symbol=${pair}&interval=${interval}&limit=${limit}&endTime=${fetchTime}`;
    try {
      const data = await request(url);
      if (!data.length) break; // Stop if no more data is returned
      for (let i = data.length - 1; i >= 0; i--) {
        allPrices.push(parseFloat(data[i][4]));
      }
      fetchTime = data[0][0]; // Update fetchTime to the earliest timestamp retrieved
    } catch (error) {
      console.error("Error fetching data from Binance:", error);
      break;
    }
    await delay(300);
  }

  return allPrices;
}
