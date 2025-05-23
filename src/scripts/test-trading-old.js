// test-trading-script is a price-history-analysis-script
import { Worker, parentPort, workerData, isMainThread } from "worker_threads";
import { readFileSync, existsSync } from "fs";
import { extractNumbers } from "../utilities.js";
import { getSupportedModes } from "../trend-analysis.js";
import TestExchangeProvider from "./test-ex-provider.js";
import DailyTrader from "./daily-trader.js";

const pair = process.argv[2]; // The currency pair E.g. ETHEUR
const modes = [process.argv[3] || "all"];
const range = extractNumbers(process.argv[4])[0]; // In days, min value 0.25 day which equivalent to 6 hours
const priceChange = extractNumbers(process.argv[5])[0]; // Price Percentage Threshold, min value 1.25
const interval = +process.argv[6] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const showLogs = process.argv[7] == "log";
const capital = 100; // Amount in EUR which is the total money that can be used for trading

const strategyModes = getSupportedModes();
let minStrategyRange = 0.5;
let maxStrategyRange = 12;
let minPercentagePriceChange = 1.5;
let maxPriceChange = 10;
if (range) minStrategyRange = maxStrategyRange = range;
if (priceChange) minPercentagePriceChange = maxPriceChange = priceChange;

async function runTradingTest(pair, minStrategyRange, minPriceChange, modes, interval) {
  try {
    if ((modes || modes[0]) == "all") modes = strategyModes;
    else if (!strategyModes.includes(modes[0])) throw new Error(`"${modes[0]}" is Invalid mode!`);

    console.log(`Started new trading with ${pair} based on ${interval} mins time interval:`);

    const prices1 = getPrices(pair, interval / 5);
    const prices2 = getPrices(`bots/${pair}`, interval / 5);
    // const prices3 = getPrices(`bots/${pair}-1`, interval / 5);

    for (const mode of modes) {
      let workers = [];
      for (let range = minStrategyRange; range <= maxStrategyRange; range += range >= 1 ? 1 : 0.5) {
        for (let priceChange = minPriceChange; priceChange <= maxPriceChange; priceChange += 0.5) {
          const cb = async (data = []) => {
            // workers.push(runWorker([pair, prices, range, priceChange, mode, interval, showLogs]));
            data.push(await testStrategy(pair, prices1, range, priceChange, mode, interval, showLogs));
            if (prices2[0]) {
              data.push(await testStrategy(pair, prices2, range, priceChange, mode, interval, showLogs));
            }
            // if (prices3[0]) {
            //   data.push(await testStrategy(pair, prices3, range, priceChange, mode, interval, showLogs));
            // }

            return data;
          };

          workers.push(cb());
        }
      }

      console.log(`Will process (${workers.length}) tests on "${mode}" mode.`);

      (await Promise.all(workers))
        .sort((a, b) => {
          const aSum = a.reduce((t, res) => t + res.balance, 0);
          const bSum = b.reduce((t, res) => t + res.balance, 0);
          return bSum - aSum;
        })
        .forEach((data) => {
          const [result1, result2, result3, result4] = data;
          let log = `${result1.mode} ${result1.range} ${result1.priceChange}% =>`;
          let otherLog = "";

          const profit1 = result1.balance - capital;
          const remain1 = result1.crypto;

          let totalProfit = profit1;
          let totalRemain = remain1;
          let totalLong = result1.m;

          otherLog += ` (${parseInt(profit1)}) =x= [${result1.m}*${result1.transactions}]`;
          if (profit1 < 5) return;

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

          console.log(`${log} €${totalProfit} Remain: ${totalRemain} ${otherLog}`);
        });
    }
  } catch (error) {
    console.log("Error with ", pair, "=>", error);
  }

  console.log(`\n`);
}

async function testStrategy(pair, prices, range, priceChange, mode, interval, showLogs) {
  let transactions = 0;
  const ex = new TestExchangeProvider({ eur: 100, crypto: 0 }, prices, interval);
  const info = { capital: 100, strategyRange: range, priceChange, mode, interval: interval };
  const trader = new DailyTrader(ex, pair, info);
  delete trader.period;

  trader.listener = (p, event, info) => {
    if (event == "SELL") transactions++;
    if (showLogs) event == "LOG" && console.log(pair, info);
  };

  for (const i in prices) {
    await trader.start();
  }

  const crypto = (await ex.balance()).crypto + 0;
  if (crypto > 0) await ex.createOrder("sell", "", "", crypto);
  const balance = +(await ex.balance()).eur.toFixed(2);

  return { range, priceChange, balance, crypto, transactions, mode, m: +(prices.length / 8640).toFixed(1) };
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
  runTradingTest(pair, minStrategyRange, minPercentagePriceChange, modes, interval);
} else if (!isMainThread && workerData) {
  const [p, prices, minStrategyRange, minPercentPriceChange, mode, interval] = workerData;
  testStrategy(p, prices, minStrategyRange, minPercentPriceChange, mode, interval).then((r) =>
    parentPort.postMessage(r)
  );
}

export default runTradingTest; // Export the runTradingTest function for use as a module

// Command example: node test-trading-script.js ETHEUR 100 100 0.25 1.5 near-low > database/logs/all.log 2>&1
