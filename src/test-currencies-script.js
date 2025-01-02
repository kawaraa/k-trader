// test-currencies-script
const { readFileSync } = require("fs");
const currencies = require("./currencies.json");
const runTradingTest = require("./test-trading-script.js");
// const runTradingTest = require("./test-trading-script-loser.js");

const capital = +process.argv[2] || 100; // Amount in EUR which is the total money that can be used for trading
const minStrategyRange = +process.argv[3] || 0.25; // In days, min value 0.25 day which equivalent to 6 hours
const minPercentPriceChange = +process.argv[4] || 1.25; // Price Percentage Threshold, min value 1.25
const modes = [process.argv[5]];
const interval = +process.argv[6] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const pairs = Object.keys(currencies);
// .filter((p) => currencies[p].note?.includes("G1"));

(async () => {
  for (const pair of pairs) {
    const shouldNotTest = currencies[pair].strategies[0] || /stable|no price/gim.test(currencies[pair].note);
    if (alreadyInProgress(pair) || shouldNotTest) continue;
    await runTradingTest(pair, capital, minStrategyRange, minPercentPriceChange, modes, interval);

    // if (global.gc) global.gc(); // Forces garbage collection
  }
})();

function alreadyInProgress(pair) {
  const getFilePath = (name) => `${process.cwd()}/database/logs/${name}.log`;
  return (
    readFileSync(getFilePath("all")).includes(pair) ||
    readFileSync(getFilePath("result-1")).includes(pair) ||
    readFileSync(getFilePath("result-2")).includes(pair) ||
    readFileSync(getFilePath("result-3")).includes(pair) ||
    readFileSync(getFilePath("result-4")).includes(pair) ||
    readFileSync(getFilePath("result-5")).includes(pair) ||
    readFileSync(getFilePath("result-6")).includes(pair)
  );
}
