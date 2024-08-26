// test-trading-script is a price-history-analysis-script
const { adjustPrice, countPriceChanges } = require("./trend-analysis.js");
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");

const pair = process.argv[2]; // The pair of the two currency that will be used for trading E.g. ETHEUR
const askBidSpreadPercentage = +process.argv[3] || 0.1; // A number from 0 to 100, the prices difference percent
const capital = +process.argv[4] || 100; // Amount in EUR which is the total money that can be used for trading
const investment = +process.argv[5] || 9;
const minStrategyRange = +process.argv[6] || 0.25; // Is a Range of the strategy in days, min value from 0.25 day which equivalent to 6 hours
const minPercentagePriceChange = +process.argv[7] || 1.25;
// const strategyInvestments = [9, 19, 32, 49, 99]; // strategySettings

// investment is and investing Amount in EUR that will be used every time to by crypto
// priceChange is a price Percentage Threshold, value from 0 to 100

// Command example: node test-trading-script.js ETHEUR 0.9 0.25 100 60 > database/log/all.log 2>&1

(async () => {
  console.log(`Started new analysis with ${pair}.\n`);

  let prices = require(`${process.cwd()}/database/test-prices/${pair}.json`);
  // const counts = countPriceChanges(prices, 2);
  // console.log(counts.length, JSON.stringify(counts));
  if (!prices[0]?.tradePrice) prices = prices.map((p) => adjustPrice(p, askBidSpreadPercentage));

  try {
    let range = minStrategyRange;
    let priceChange = minPercentagePriceChange;

    const result = await testStrategy(pair, prices, capital, investment, range, priceChange);
    console.log(
      `Strategy: ${result.investment}, ${result.priceChange}, ${result.range} -`,
      "Balance: ",
      result.balance,
      "-",
      result.crypto,
      "=> ",
      +((result.balance - capital) / 2).toFixed(2)
    );
  } catch (error) {
    console.log("Error with ", pair, "===>", error);
  }
  console.log(`\n\n`);
})();

async function testStrategy(pair, prices, capital, investment, range, priceChange) {
  const pricesOffset = (priceChange * 24 * 60) / 5;
  const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, pricesOffset);
  const info = { capital, investment, priceChange, strategyRange: range };
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

  return {
    investment,
    priceChange,
    range,
    balance: +(await ex.balance()).eur.toFixed(2),
    crypto,
  };
}
