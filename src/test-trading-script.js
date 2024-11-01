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

const pair = process.argv[2];
const capital = +process.argv[3] || 100;
const investment = +process.argv[4] || 9;
const minStrategyRange = +process.argv[5] || 0.25;
const minPercentagePriceChange = +process.argv[6] || 1.25;
const mode = process.argv[7] || modes[0];
const timeInterval = 5;

// Command example: node test-trading-script.js ETHEUR 100 99 0.25 1.1 near-low > database/log/all.log 2>&1

if (!modes.includes(mode)) throw new Error("Invalid mode!");

(async () => {
  console.log(`Started new trading with ${pair}.\n`);

  try {
    let prices = require(`${process.cwd()}/database/prices/${pair}.json`);
    // prices = prices.slice(0, Math.round(prices.length / 2));
    // prices = prices.slice(-Math.round(prices.length / 2));

    let maxBalance = 0;
    for (let range = minStrategyRange; range <= 1; range += 0.25) {
      for (let priceChange = minPercentagePriceChange; priceChange <= 7; priceChange += 0.5) {
        const result = await testStrategy(pair, prices, capital, investment, range, priceChange);
        const remain = parseInt(result.crypto);
        const transactions = parseInt(result.transactions);

        if (maxBalance < result.balance + 3) {
          maxBalance = result.balance;
          console.log(
            `€${capital} €${result.investment} >${result.range}< ${result.priceChange}% ${mode} =>`,
            `€${parseInt(result.balance - capital)} Remain: ${remain} Transactions: ${transactions}`
          );
        }
      }
    }
  } catch (error) {
    console.log("Error with ", pair, "=>", error);
  }
  console.log(`\n\n`);
})();

async function testStrategy(pair, prices, capital, investment, range, priceChange) {
  let transactions = 0;
  const pricesOffset = (range * 24 * 60) / timeInterval;
  const ex = new TestExchangeProvider({ eur: capital, crypto: 0 }, prices, pricesOffset);
  const info = { capital, investment, strategyRange: range, priceChange, mode, timeInterval };
  const trader = new DailyTrader(ex, pair, info);
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

  return {
    investment,
    priceChange,
    range,
    balance: +(await ex.balance()).eur.toFixed(2),
    crypto,
    transactions,
  };
}
