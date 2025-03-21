// test-currencies-script
const { readFileSync } = require("fs");
const currencies = require("./currencies.json");
const runTradingTest = require("./test-trading-script.js");
const { strIncludes } = require("./utilities.js");
const getFilePath = (name) => `${process.cwd()}/database/logs/${name}.log`;

const modes = [process.argv[2] || "all"];
const minStrategyRange = +process.argv[3] || 0.5; // In days, min value 0.25 day which equivalent to 6 hours
const minPercentPriceChange = +process.argv[4] || 1.5; // Price Percentage Threshold, min value 1.25
const interval = +process.argv[5] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
let pairs = Object.keys(currencies);
// .filter((p) => !/stable|no price/gim.test(currencies[p].note));
// stable,no price -  /stable|no price/gim  -  /loser.*g1/gim

(async () => {
  for (const pair of pairs) {
    if (alreadyInProgress(pair)) continue;
    await runTradingTest(pair, minStrategyRange, minPercentPriceChange, modes, interval);
    // if (global.gc) global.gc(); // Forces garbage collection
  }
})();

function alreadyInProgress(pair) {
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
