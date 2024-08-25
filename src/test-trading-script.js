// test-trading-script is a price-history-analysis-script
const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { adjustPrice } = require("./trend-analysis.js");
const { request, delay } = require("./utilities.js");

const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");

const pair = process.argv[2]; // The pair of the two currency that will be used for trading E.g. ETHEUR
const askBidSpreadPercentage = +process.argv[3] || 0.1; // A number from 0 to 100, the prices difference percent
const capital = +process.argv[4] || 100; // Amount in EUR which is the total money that can be used for trading
const minStrategyRange = +process.argv[5] || 0.25; // Is a Range of the strategy in days, min value from 0.25 day which equivalent to 6 hours
const minPercentagePriceChange = +process.argv[6] || 1.25;
const minTestPeriod = +process.argv[7] || 60; // Number of days that will be tested
const strategyInvestments = [9, 19, 32, 49, 99]; // strategySettings
const cryptos = pair ? { [pair]: pair } : require(`./currencies.json`).other;

// Command example: node test-trading-script.js ETHEUR 0.9 0.25 100 60 > database/log/all.log 2>&1

(async () => {
  for (const pair in cryptos) {
    console.log(`Started new analysis with ${pair}.\n`);

    const filePath = `${process.cwd()}/database/test-prices/${pair}.json`;
    const result = { investment: 0, priceChange: 0, range: 0, balance: 0 };
    let prices = [];

    if (existsSync(filePath)) {
      prices = JSON.parse(readFileSync(filePath, "utf8"));
      // if (!prices[0]) writeFileSync(filePath, JSON.stringify(await getBinanceData(pair, minTestPeriod)));
      if (!prices[0]?.tradePrice) prices = prices.map((p) => adjustPrice(p, askBidSpreadPercentage));
    } else {
      console.log(`No prices file is found for ${pair}`);
      if (filePath.includes("test-prices")) {
        writeFileSync(filePath, JSON.stringify(await getBinanceData(pair, minTestPeriod)));
      }
    }

    try {
      for (const investment of strategyInvestments) {
        // investment is and investing Amount in EUR that will be used every time to by crypto
        // priceChange is a price Percentage Threshold, value from 0 to 100
        let range = minStrategyRange;

        while (range <= 6) {
          let percentageChange = minPercentagePriceChange;
          while (percentageChange <= 10) {
            percentageChange += 0.25;

            const pricesOffset = (range * 24 * 60) / 5;
            const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, pricesOffset);
            const info = { capital, investment, priceChange: percentageChange, strategyRange: range };
            const trader = new DailyTrader(ex, pair, info);
            trader.listener = (p, event, info) => {
              event == "sell" && ex.removeOrder(info);
              // event == "log" && console.log(pair, info);
            };

            for (const i in prices) {
              if (i < pricesOffset || prices.length - pricesOffset <= i) continue;
              await trader.start();
            }

            const crypto = (await ex.balance()).crypto + 0;
            if (crypto > 0) await ex.createOrder("sell", "", "", crypto);
            const eur = +(await ex.balance()).eur.toFixed(2);

            // 200 <= eur &&
            if (result.balance <= eur + 1) {
              result.balance = eur;
              result.range = range;
              result.investment = investment;
              result.priceChange = percentageChange;
              console.log(
                `Strategy: ${result.investment}, ${result.priceChange}, ${result.range} -`,
                "Balance: ",
                result.balance,
                "-",
                crypto,
                "=> ",
                +((result.balance - 100) / 2).toFixed(2)
              );
            }

            range += 0.25;
          }
        }
      }
    } catch (error) {
      console.log("Error with ", pair, "===>", error);
    }
    console.log(`\n\n`);
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
    await delay(500);
  }

  return allPrices;
}
