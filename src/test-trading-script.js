// test-trading-script is a price-history-analysis-script
const { Worker, parentPort, workerData, isMainThread } = require("worker_threads");
const { readFileSync, existsSync } = require("fs");
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");

const pair = process.argv[2]; // The currency pair E.g. ETHEUR
const interval = +process.argv[3] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const strategy = process.argv[4] == "log" ? "" : process.argv[4];
const showLogs = process.argv.includes("log");

const capital = 100; // Amount in EUR which is the total money that can be used for trading

async function runTradingTest(pair, interval, strategy) {
  try {
    console.log(`Started new trading with ${pair} based on ${interval} mins time interval:`);

    const prices1 = getPrices(pair, interval / 5);
    // const prices2 = getPrices(`bots/${pair}`, interval / 5);
    // const prices3 = getPrices(`bots/${pair}-1`, interval / 5);

    // workers.push(runWorker([pair, prices, interval, strategy, showLogs]));
    const tests = [await testStrategy(pair, prices1, interval, strategy, showLogs)];
    // if (prices2[0]) {
    //   tests.push(
    //     await testStrategy(pair, prices2, interval, strategy, showLogs)
    //   );
    // }
    // if (prices3[0]) {
    //   tests.push(
    //     await testStrategy(pair, prices3, interval, strategy, showLogs)
    //   );
    // }

    const [result1, result2, result3] = tests;
    let otherLog = "";

    const profit1 = result1.balance - capital;
    const remain1 = result1.crypto;

    let totalProfit = profit1;
    let totalRemain = remain1;
    let totalLong = result1.m;

    otherLog += ` (${parseInt(profit1)}) =x= [${result1.m}*${result1.transactions}]`;
    // if (profit1 < 5) return;

    if (result2) {
      const profit = result2.balance - capital;
      if ((result2.m <= 0.5 && profit < -5) || (result2.m > 0.5 && profit < 5)) return;
      totalProfit += profit;
      totalRemain += result2.crypto;
      totalLong += result2.m;
      otherLog += `  +  (${parseInt(profit)}) =x= [${result2.m}*${result2.transactions}]`;
    }
    if (result3) {
      const profit = result3.balance - capital;
      if ((result2.m <= 0.5 && profit < -5) || (result2.m > 0.5 && profit < 5)) return;
      totalProfit += profit;
      totalRemain += result3.crypto;
      totalLong += result3.m;
      otherLog += `  +  (${parseInt(profit)}) =x= [${result3.m}*${result3.transactions}]`;
    }

    totalProfit = parseInt(totalProfit / totalLong);
    totalRemain = parseInt(totalRemain / totalLong);

    console.log(`${pair} => €${totalProfit} Remain: ${totalRemain} ${otherLog}`);
  } catch (error) {
    console.log("Error with ", pair, "=>", error);
  }

  console.log(`\n`);
}

async function testStrategy(pair, prices, interval, strategy, showLogs) {
  const m = +(prices.length / 8640).toFixed(1);
  let transactions = 0;
  const ex = new TestExchangeProvider({ eur: 100, crypto: 0 }, prices, interval);
  const testMode = !!(strategy || "").trim();
  const trader = new DailyTrader(ex, pair, { timeInterval: interval, capital: 100, strategy, testMode });

  delete trader.period;

  trader.listener = (p, event, info) => {
    if (event == "sell") {
      ex.removeOrder(info);
      transactions++;
    } else if (event == "strategy") {
      ex.strategy = info.strategy;
      ex.strategyTimestamp = 0;
    }

    if (showLogs) event == "log" && console.log(pair, info);
  };

  for (const i in prices) {
    await trader.start();
  }

  const crypto = (await ex.balance()).crypto + 0;
  if (crypto > 0) await ex.createOrder("sell", "", "", crypto);
  const balance = +(await ex.balance()).eur.toFixed(2);

  return { balance, crypto, transactions, strategy: strategy || ex.getState(pair, "strategy"), m };
}

function getPrices(pair, skip = 1) {
  const path = `${process.cwd()}/database/prices/${pair}.json`;
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path)).filter((p, index) => index % skip === 0);

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
  runTradingTest(pair, interval, strategy);
} else if (!isMainThread && workerData) {
  const [p, prices, interval, strategy] = workerData;
  testStrategy(p, prices, interval, strategy).then((r) => parentPort.postMessage(r));
} else {
  module.exports = runTradingTest; // Export the runTradingTest function for use as a module
}

// Command example: node test-trading-script.js ETHEUR 100 100 0.25 1.5 near-low > database/logs/all.log 2>&1
