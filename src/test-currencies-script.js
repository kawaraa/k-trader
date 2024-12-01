// test-currencies-script
const currencies = require("./currencies.json");
const runTradingTest = require("./test-trading-script.js");

const capital = +process.argv[2] || 100; // Amount in EUR which is the total money that can be used for trading
const investment = +process.argv[3] || 10; // investing Amount in EUR that will be used every time to by crypto
const minStrategyRange = +process.argv[4] || 0.25; // In days, min value 0.25 day which equivalent to 6 hours
const minPercentPriceChange = +process.argv[5] || 1.25; // Price Percentage Threshold, min value 1.25
const modes = process.argv[6];
const interval = +process.argv[7] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours

// Command example: node test-trading-script.js ETHEUR 100 99 0.25 1.1 near-low > database/log/all.log 2>&1

const pairs = Object.keys(currencies); // .slice();

(async () => {
  for (const pair of pairs) {
    if (currencies[pair].note?.includes("stable")) continue;
    await runTradingTest(pair, capital, investment, minStrategyRange, minPercentPriceChange, modes, interval);

    // if (global.gc) global.gc(); // Forces garbage collection
  }
})();
