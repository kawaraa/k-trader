// test-trading-script is a price-history-analysis-script
const { readFileSync } = require("fs");
const TestExchangeProvider = require("./test-ex-provider.js");
const DailyTrader = require("./daily-trader.js");
const modes = [
  "high-drop",
  "near-low",
  "high-drop-partly-trade",
  "high-drop-slowly-trade",
  "near-low-partly-trade",
  "near-low-slowly-trade",
  "on-increase",
];

async function runTradingTest(pair, capital, investment, minStrategyRange, minPriceChange, mode, interval) {
  if (!modes.includes(mode)) throw new Error("Invalid mode!");
  console.log(`Started new trading with ${pair} based on ${interval} mins time interval.\n`);

  try {
    const prices = getPrices(pair, interval / 5);

    let maxBalance = 0;
    for (let range = minStrategyRange; range <= 1; range += 0.25) {
      for (let priceChange = minPriceChange; priceChange <= 10; priceChange += 0.5) {
        const res = await testStrategy(pair, prices, capital, investment, range, priceChange, mode, interval);
        const remain = parseInt(res.crypto) / 2;
        const transactions = parseInt(res.transactions) / 2;

        if (res.balance >= 10 && maxBalance < res.balance + 3) {
          maxBalance = res.balance;
          console.log(
            `€${capital} €${res.investment} >${res.range}< ${res.priceChange}% ${mode} =>`,
            `€${parseInt(res.balance - capital) / 2} Remain: ${remain} Transactions: ${transactions}`
          );
        }
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
  return { investment, priceChange, range, balance, crypto, transactions };
}

function getPrices(pair, skip) {
  return JSON.parse(readFileSync(`${process.cwd()}/database/prices/${pair}.json`)).filter((p, index) => {
    return index % skip === 0;
  });

  // prices = prices.slice(0, Math.round(prices.length / 2)); // month 1
  // prices = prices.slice(-Math.round(prices.length / 2)); // month 2

  // let prices = require(`${process.cwd()}/database/test-prices/${pair}.json`);
  // const askBidSpread = currencies[pair].askBidSpreadPercentage; //the prices difference percent between ask and bid prices
  // if (!prices[0]?.tradePrice) prices = prices.map((p) => adjustPrice(p, askBidSpread));
}

// Export the runTradingTest function for use as a module
module.exports = runTradingTest;

// Run the runTradingTest function if the script is executed directly
if (require.main === module) {
  const pair = process.argv[2]; // The currency pair E.g. ETHEUR
  const capital = +process.argv[3] || 100; // Amount in EUR which is the total money that can be used for trading
  const investment = +process.argv[4] || 10; // investing Amount in EUR that will be used every time to by crypto
  const minStrategyRange = +process.argv[5] || 0.25; // In days, min value 0.25 day which equivalent to 6 hours
  const minPercentagePriceChange = +process.argv[6] || 1.25; // Price Percentage Threshold, min value 1.25
  const mode = process.argv[7] || modes[0];
  const interval = +process.argv[8] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours

  runTradingTest(pair, capital, investment, minStrategyRange, minPercentagePriceChange, mode, interval).then(
    () => null
  );
}

// Command example: node test-trading-script.js ETHEUR 100 100 0.25 1.5 near-low > database/logs/all.log 2>&1
