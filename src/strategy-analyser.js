const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");
// The strategy range is in days, min value 0.25 day which equivalent to 6 hours
// the Price Percent Change is the Price Percentage Threshold, min value 1.25

async function findStrategy(pair, prices, interval, mode) {
  let workers = [];
  for (let range = 0.5; range <= 12; range += range >= 1 ? 1 : 0.5) {
    for (let priceChange = 1.5; priceChange <= 10; priceChange += 0.5) {
      workers.push(testStrategy(pair, prices, interval, mode, range, priceChange));
    }
  }

  return (await Promise.all(workers)).sort((a, b) => b.balance - a.balance)[0];
}

async function testStrategy(pair, prices, interval, mode, range, pricePercentChange, showLogs) {
  const m = +(prices.length / 8640).toFixed(1);
  let transactions = 0;
  const ex = new TestExchangeProvider({ eur: 100, crypto: 0 }, prices, interval);
  const trader = new DailyTrader(ex, pair, { capital: 100, mode, timeInterval: interval });
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

  return { range, pricePercentChange, balance, crypto, transactions, mode, m };
}

module.exports = { findStrategy, testStrategy };
