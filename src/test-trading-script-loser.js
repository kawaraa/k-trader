// test-trading-script is a price-history-analysis-script
const { readFileSync } = require("fs");
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");
const strategyModes = require("./trend-analysis.js").getSupportedModes();

async function runTradingTest(pair, capital, minStrategyRange, minPriceChange, modes, interval) {
  try {
    if ((modes || modes[0]) == "all") modes = strategyModes;
    else if (!strategyModes.includes(modes[0])) throw new Error(`"${modes[0]}" is Invalid mode!`);

    console.log(`Started new trading with ${pair} based on ${interval} mins time interval:`);

    const prices = getPrices(pair, interval / 5);
    const prices1 = getPrices(pair, interval / 5, "bots/");
    let maxBalance = 0;

    for (const investment of [capital, parseInt(capital / 3)]) {
      for (const mode of modes) {
        let workers = [];
        for (let range = minStrategyRange; range <= 1; range += 0.25) {
          for (let priceChange = minPriceChange; priceChange <= 10; priceChange += 0.5) {
            const worker = async () => {
              const result = await testStrategy(
                pair,
                prices,
                capital,
                investment,
                range,
                priceChange,
                mode,
                interval
              );
              const result1 = await testStrategy(
                pair,
                prices1,
                capital,
                investment,
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
                  `€${capital} €${investment} >${range}< ${priceChange}% ${mode} =>`,
                  `€${totalProfit} Remain: ${remain} Transactions: ${transactions} Gainer: ${profit1} Loser: ${profit2}`
                );
              }
              return result;
            };
            workers.push(worker());
          }
        }

        await Promise.all(workers);
      }
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

module.exports = runTradingTest; // Export the runTradingTest function for use as a module
