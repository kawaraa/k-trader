// test-trading-script is a price-history-analysis-script
import { Worker, parentPort, workerData, isMainThread } from "worker_threads";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import TestExchangeProvider from "../providers/test-ex-provider.js";
import SmartTrader from "../traders/smart-trader.js";

const pair = process.argv[2]; // The currency pair E.g. ETHEUR
const interval = +process.argv[3] || 10; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const showLogs = process.argv.includes("log");
const capital = 100; // Amount in EUR which is the total money that can be used for trading
// const priceLimit = (3 * 60 * 60) / 10;

async function runTradingTest(pair, interval) {
  try {
    console.log(`Started new trading with ${pair}`);

    const prices = getPrices(pair);

    const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, interval);
    const trader = new SmartTrader(ex, pair, interval, {});
    // ex.currentPriceIndex = priceLimit - 1;
    let trades = [];
    let position = null;

    trader.listener = (p, event, info) => {
      if (showLogs && event == "LOG") {
        console.log((info ? pair + " " : "") + (info || ""));
        // console.log(...parseNumInLog((info ? pair + " " : "") + (info || "")));
      } else {
        if (event == "BUY") position = info;
        if (event == "SELL") {
          position = null;
          trades.push(info);
        }
      }
    };

    // Start from after 3 hrs
    let prevCryptoBalance;
    for (let i = 0; i < prices.length; i++) {
      const { eur, crypto } = await ex.balance();
      prevCryptoBalance = crypto;
      await trader.trade(capital, prices[i], eur, crypto, trades, position, true, true);
      await ex.currentPrices();
    }

    await trader.sellManually(pair, (await ex.balance()).crypto);
    const profit = (await ex.balance()).eur - capital;

    console.log(
      `${pair} => €${parseInt(profit)} Remain: ${prevCryptoBalance} Transactions: ${trades.length}`
    );
  } catch (error) {
    console.log("Error with ", pair, "=>", error);
  }
}

function getPrices(pair, skip = 1) {
  const prices = [];
  const path = `${process.cwd()}/database/prices/${pair}`;
  if (!existsSync(path)) return prices;
  const cb = (line) => line.trim() && prices.push(JSON.parse(line));
  readFileSync(path, "utf8").split(/\r?\n/).forEach(cb);
  return prices;

  // return JSON.parse(readFileSync(path)).filter((p, index) => index % skip === 0);
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
  // const [p, prices, interval] = workerData;
  // runTest(p, prices, interval).then((r) => parentPort.postMessage(r));
  console.log("Running as Worker");
}

export default runTradingTest; // Export the runTradingTest function for use as a module

// Command example: node test-trading-script.js ETHEUR 100 100 0.25 1.5 near-low > database/logs/all.log 2>&1
