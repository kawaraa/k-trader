// test-trading-script is a price-history-analysis-script
const { Worker, parentPort, workerData, isMainThread } = require("worker_threads");
const { readFileSync } = require("fs");
const { extractNumbers } = require("./utilities.js");
const { getSupportedModes } = require("./trend-analysis.js");
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");

const month2 = process.argv[2] == "m2";
const pair = process.argv[3]; // The currency pair E.g. ETHEUR
const modes = [process.argv[4] || "all"];
const range = extractNumbers(process.argv[5])[0]; // In days, min value 0.25 day which equivalent to 6 hours
const priceChange = extractNumbers(process.argv[6])[0]; // Price Percentage Threshold, min value 1.25
const interval = +process.argv[7] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const showLogs = process.argv[8] == "log";
const capital = 100; // Amount in EUR which is the total money that can be used for trading

const strategyModes = getSupportedModes();
let minStrategyRange = 0.5;
let maxStrategyRange = 12;
let minPercentagePriceChange = 1.5;
let maxPriceChange = 10;
if (range) minStrategyRange = maxStrategyRange = range;
if (priceChange) minPercentagePriceChange = maxPriceChange = priceChange;

async function runTradingTest(pair, minStrategyRange, minPriceChange, modes, interval, month2) {
  try {
    if ((modes || modes[0]) == "all") modes = strategyModes;
    else if (!strategyModes.includes(modes[0])) throw new Error(`"${modes[0]}" is Invalid mode!`);

    console.log(`Started new trading with ${pair} based on ${interval} mins time interval:`);

    const prices1 = getPrices(pair, interval / 5, "");
    const prices2 = month2 && getPrices(pair, interval / 5, "bots/"); // bots/v-2/

    for (const mode of modes) {
      let workers = [];
      for (let range = minStrategyRange; range <= maxStrategyRange; range += range >= 1 ? 1 : 0.5) {
        for (let priceChange = minPriceChange; priceChange <= maxPriceChange; priceChange += 0.5) {
          const cb = async (data = {}) => {
            // workers.push(runWorker([pair, prices, range, priceChange, mode, interval, showLogs]));
            data.result1 = await testStrategy(pair, prices1, range, priceChange, mode, interval, showLogs);
            if (prices2) {
              data.result2 = await testStrategy(pair, prices2, range, priceChange, mode, interval, showLogs);
            }
            return data;
          };

          workers.push(cb());
        }
      }

      console.log(`Will process (${workers.length}) tests on "${mode}" mode.`);

      (await Promise.all(workers))
        .sort((a, b) => {
          if (!a.result2) return b.result1.balance - a.result1.balance;
          else {
            return b.result1.balance + b.result2.balance - (a.result1.balance + a.result2.balance);
          }
        })
        .forEach((data) => {
          if (!data.result2) {
            let { crypto, mode, range, priceChange, transactions, balance } = data.result1;
            const netProfit = parseInt(balance - capital) / 2;
            const remain = parseInt(crypto) / 2;
            transactions = parseInt(transactions) / 2;
            if (netProfit >= 5) {
              console.log(
                `${mode} ${range} ${priceChange}% => €${netProfit} Remain: ${remain} Transactions: ${transactions}`
              );
            }
          } else {
            const { result1, result2 } = data;
            const profit1 = parseInt((result1.balance - capital) / 2);
            const profit2 = parseInt(result2.balance - capital);

            result1.balance += profit2;
            result1.crypto += result2.crypto;
            result1.transactions += result2.transactions;

            const remain = parseInt(result1.crypto / 3);
            const transactions = parseInt(result1.transactions / 3);
            const netProfit = parseInt((result1.balance - capital) / 3);
            if (netProfit >= 5 && profit1 >= 0 && profit2 >= 0) {
              console.log(
                `${result1.mode} ${result1.range} ${result1.priceChange}% => €${netProfit} Remain: ${remain} Transactions: ${transactions} Gainer: ${profit1} Loser: ${profit2}`
              );
            }
          }
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
  const info = { capital: 100, strategyRange: range, priceChange, mode, timeInterval: interval };
  const trader = new DailyTrader(ex, pair, info);
  delete trader.period;

  trader.listener = (p, event, info) => {
    if (event == "sell") {
      ex.removeOrder(info);
      transactions++;
    }
    if (showLogs) event == "log" && console.log(pair, info);
  };

  for (const i in prices) {
    await trader.start();
  }

  const crypto = (await ex.balance()).crypto + 0;
  if (crypto > 0) await ex.createOrder("sell", "", "", crypto);
  const balance = +(await ex.balance()).eur.toFixed(2);

  return { range, priceChange, balance, crypto, transactions, mode };
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
  runTradingTest(pair, minStrategyRange, minPercentagePriceChange, modes, interval, month2);
} else if (!isMainThread && workerData) {
  const [p, prices, minStrategyRange, minPercentPriceChange, mode, interval] = workerData;
  testStrategy(p, prices, minStrategyRange, minPercentPriceChange, mode, interval).then((r) =>
    parentPort.postMessage(r)
  );
} else {
  module.exports = runTradingTest; // Export the runTradingTest function for use as a module
}

// Command example: node test-trading-script.js ETHEUR 100 100 0.25 1.5 near-low > database/logs/all.log 2>&1
