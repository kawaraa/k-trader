// test-trading-script is a price-history-analysis-script
const { readFileSync } = require("fs");
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");
const strategyModes = require("./trend-analysis.js").getSupportedModes();

const pair = process.argv[2]; // The currency pair E.g. ETHEUR
const capital = +process.argv[3] || 100; // Amount in EUR which is the total money that can be used for trading
const minStrategyRange = +process.argv[4] || 0.25; // In days, min value 0.25 day which equivalent to 6 hours
const minPercentagePriceChange = +process.argv[5] || 1.25; // Price Percentage Threshold, min value 1.25
const modes = [process.argv[6]];
const interval = +process.argv[7] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const maxStrategyRange = +process.argv[8] || 1;
const maxPriceChange = +process.argv[9] || 10;

async function runTradingTest(pair, capital, minStrategyRange, minPriceChange, modes, interval) {
  try {
    if ((modes || modes[0]) == "all") modes = strategyModes;
    else if (!strategyModes.includes(modes[0])) throw new Error(`"${modes[0]}" is Invalid mode!`);

    console.log(`Started new trading with ${pair} based on ${interval} mins time interval:`);

    const prices = getPrices(pair, interval / 5);
    const prices1 = getPrices(pair, interval / 5, "bots/");
    let maxBalance = 0;

    for (const mode of modes) {
      let workers = [];
      for (let range = minStrategyRange; range <= maxStrategyRange; range += 0.25) {
        for (let priceChange = minPriceChange; priceChange <= maxPriceChange; priceChange += 0.5) {
          const worker = async () => {
            const result = await testStrategy(
              pair,
              prices,
              capital,
              capital,
              range,
              priceChange,
              mode,
              interval
            );
            const result1 = await testStrategy(
              pair,
              prices1,
              capital,
              capital,
              range,
              priceChange,
              mode,
              interval
            );

            const profit1 = parseInt((result.balance - capital) / 2);
            const profit2 = parseInt(result1.balance - capital);

            result.balance += profit2;
            result.crypto += result1.crypto;
            result.transactions += result1.transactions;

            const remain = parseInt(result.crypto / 3);
            const transactions = parseInt(result.transactions / 3);
            const totalProfit = parseInt((result.balance - capital) / 3);

            if (totalProfit >= 10 && maxBalance < result.balance + 3) {
              maxBalance = result.balance;
              console.log(
                `€${capital} €${capital} >${range}< ${priceChange}% ${mode} =>`,
                `€${totalProfit} Remain: ${remain} Transactions: ${transactions} Gainer: ${profit1} Loser: ${profit2}`
              );
            }
            return result;
          };
          workers.push(worker());
        }
      }

      await Promise.all(workers);
      // console.log(`Processed (${workers.length}) tests on "${mode}" mode.`);
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
  const info = { capital, investment, strategyRange: range, priceChange, mode, timeInterval: interval };
  const trader = new DailyTrader(ex, pair, info);
  delete trader.period;

  trader.listener = (p, event, info) => {
    if (event == "sell") {
      ex.removeOrder(info);
      transactions++;
    }
    // event == "log" && console.log(pair, info);
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
}

// Run the runTradingTest function if the script is executed directly
if (require.main === module) {
  runTradingTest(pair, capital, minStrategyRange, minPercentagePriceChange, modes, interval);
} else {
  module.exports = runTradingTest; // Export the runTradingTest function for use as a module
}
