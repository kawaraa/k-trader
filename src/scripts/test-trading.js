// test-trading-script is a price-history-analysis-script
import { Worker, parentPort, workerData, isMainThread } from "worker_threads";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import TestExchangeProvider from "../providers/test-ex-provider.js";
import BasicTrader from "../trader/basic-trader.js";
// import BasicTrader from "../trader/basic-trader-1.js";

const pair = process.argv[2]; // The currency pair E.g. ETHEUR
const interval = +process.argv[3] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const suffix = +process.argv[4] || "";
const showLogs = process.argv.includes("log");
const capital = 100; // Amount in EUR which is the total money that can be used for trading

async function runTradingTest(pair, interval) {
  try {
    console.log(`Started new trading with ${pair} based on ${interval} mins time interval:`);

    const prices = getPrices(`${pair + suffix}`, interval / 5);
    const result = await runTest(pair, prices, interval, showLogs);

    const profit = result.balance - capital;
    let monthlyProfit = parseInt(profit / result.m);
    let monthlyRemain = parseInt(result.crypto / result.m);

    console.log(
      `${pair} => €${monthlyProfit} Remain: ${monthlyRemain} (${parseInt(profit)}) =x= [${result.m}*${
        result.transactions
      }]`
    );
  } catch (error) {
    console.log("Error with ", pair, "=>", error);
  }

  console.log(`\n`);
}

async function runTest(pair, prices, interval, showLogs) {
  const m = +((prices.length * interval) / 43200).toFixed(1); // 43200 is the number of mins in one month
  const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, interval);
  const trader = new BasicTrader(ex, pair, { interval, capital, mode: "live" });
  delete trader.period;
  ex.currentPriceIndex = trader.range;

  trader.listener = (p, event, info) => {
    if (showLogs && event == "LOG") {
      console.log((info ? pair + " " : "") + (info || ""));
      // console.log(...parseNumInLog((info ? pair + " " : "") + (info || "")));
    } else {
      if (event == "BALANCE") ex.state.balance = info;
      if (event == "BUY") ex.state.position = info;
      if (event == "SELL") {
        ex.state.position = null;
        ex.state.trades.push(info);
      }
    }
  };

  for (let i = trader.range; i < prices.length; i++) {
    await trader.start();
  }

  const crypto = (await ex.balance()).crypto + 0;
  if (crypto > 0) await ex.createOrder("sell", "", "", crypto);
  const balance = +(await ex.balance()).eur.toFixed(2);

  return { balance, crypto, transactions: ex.state.trades.length, m };
}

function getPrices(pair, skip = 1) {
  const path = `${process.cwd()}/database/prices-local/${pair}.json`;
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

// Check if this is the main module (equivalent to require.main === module)
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
// Run the runTradingTest function if the script is executed directly
if (isMainModule && isMainThread) {
  runTradingTest(pair, interval);
} else if (!isMainThread && workerData) {
  const [p, prices, interval] = workerData;
  runTest(p, prices, interval).then((r) => parentPort.postMessage(r));
}

export default runTradingTest; // Export the runTradingTest function for use as a module

// Command example: node test-trading-script.js ETHEUR 100 100 0.25 1.5 near-low > database/logs/all.log 2>&1
