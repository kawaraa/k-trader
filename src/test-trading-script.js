// test-trading-script is a price-history-analysis-script
const { Worker, parentPort, workerData, isMainThread } = require("worker_threads");
const { readFileSync } = require("fs");
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");
const strategyModes = require("./trend-analysis").getSupportedModes();

const pair = process.argv[2]; // The currency pair E.g. ETHEUR
const capital = +process.argv[3] || 100; // Amount in EUR which is the total money that can be used for trading
// const investment = +process.argv[4] || 10; // investing Amount in EUR that will be used every time to by crypto
const minStrategyRange = +process.argv[4] || 0.25; // In days, min value 0.25 day which equivalent to 6 hours
const minPercentagePriceChange = +process.argv[5] || 1.25; // Price Percentage Threshold, min value 1.25
const modes = [process.argv[6]];
const interval = +process.argv[7] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const maxStrategyRange = +process.argv[8] || 1;
const maxPriceChange = +process.argv[9] || 10;
const showLogs = !!process.argv[10];

async function runTradingTest(pair, capital, minStrategyRange, minPriceChange, modes, interval) {
  try {
    if ((modes || modes[0]) == "all") modes = strategyModes;
    else if (!strategyModes.includes(modes[0])) throw new Error(`"${modes[0]}" is Invalid mode!`);

    console.log(`Started new trading with ${pair} based on ${interval} mins time interval:`);

    const prices = getPrices(pair, interval / 5, "");
    let maxBalance = 0;

    for (const mode of modes) {
      let workers = [];
      for (let range = minStrategyRange; range <= maxStrategyRange; range += 0.25) {
        for (let priceChange = minPriceChange; priceChange <= maxPriceChange; priceChange += 0.5) {
          // workers.push(runWorker([pair, prices, capital, investment, range, priceChange, mode, interval]));
          workers.push(testStrategy(pair, prices, capital, capital, range, priceChange, mode, interval));
        }
      }

      (await Promise.all(workers)).forEach((r) => {
        const remain = parseInt(r.crypto) / 2;
        const transactions = parseInt(r.transactions) / 2;
        if (r.balance - r.capital >= 10 && maxBalance < r.balance + 3) {
          maxBalance = r.balance;
          console.log(
            `€${r.capital} €${r.investment} >${r.range}< ${r.priceChange}% ${r.mode} =>`,
            `€${parseInt(r.balance - r.capital) / 2} Remain: ${remain} Transactions: ${transactions}`
          );
        }
      });
    }
  } catch (error) {
    console.log("Error with ", pair, "=>", error);
  }

  console.log(`\n`);
}

async function testStrategy(pair, prices, capital, investment, range, priceChange, mode, interval) {
  let transactions = 0;
  const pricesOffset = (range * 24 * 60) / interval;
  const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, pricesOffset, interval);
  const info = { capital, investment, strategyRange: range, priceChange, mode };
  const trader = new DailyTrader(ex, pair, info);
  trader.timeInterval = interval;
  trader.listener = (p, event, info) => {
    if (event == "sell") {
      ex.removeOrder(info);
      transactions++;
    }
    if (showLogs) event == "log" && console.log(pair, info);
  };

  for (const i in prices) {
    if (i < pricesOffset || prices.length - pricesOffset <= i) continue;
    await trader.start();
  }
  const crypto = (await ex.balance()).crypto + 0;
  if (crypto > 0) await ex.createOrder("sell", "", "", crypto);
  const balance = +(await ex.balance()).eur.toFixed(2);

  return { investment, priceChange, range, balance, crypto, transactions, capital, mode };
}

function getPrices(pair, skip = 1, path = "") {
  return JSON.parse(readFileSync(`${process.cwd()}/database/prices/${path + pair}.json`)).filter(
    (p, index) => {
      return index % skip === 0;
    }
  );

  // prices = prices.slice(0, Math.round(prices.length / 2)); // month 1
  // prices = prices.slice(-Math.round(prices.length / 2)); // month 2

  // let prices = require(`${process.cwd()}/database/test-prices/${pair}.json`);
  // const askBidSpread = currencies[pair].askBidSpreadPercentage; //the prices difference percent between ask and bid prices
  // if (!prices[0]?.tradePrice) prices = prices.map((p) => adjustPrice(p, askBidSpread));
}

function runWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker("./src/test-trading-script.js", { workerData });

    worker.on("message", resolve); // Resolve the promise with the worker's message
    worker.on("error", reject); // Reject on worker error
    worker.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

// Run the runTradingTest function if the script is executed directly
if (require.main === module && isMainThread) {
  runTradingTest(pair, capital, minStrategyRange, minPercentagePriceChange, modes, interval);
} else if (!isMainThread && workerData) {
  const [p, prices, capital, invmt, minStrategyRange, minPercentPriceChange, mode, interval] = workerData;
  testStrategy(p, prices, capital, invmt, minStrategyRange, minPercentPriceChange, mode, interval).then((r) =>
    parentPort.postMessage(r)
  );
} else {
  module.exports = runTradingTest; // Export the runTradingTest function for use as a module
}

// Command example: node test-trading-script.js ETHEUR 100 100 0.25 1.5 near-low > database/logs/all.log 2>&1
