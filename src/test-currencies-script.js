// test-currencies-script
const { readFileSync } = require("fs");
const currencies = require("./currencies.json");
const runTradingTest = require("./test-trading-script.js");

const modes = [process.argv[2] || "all"];
const minStrategyRange = +process.argv[3] || 0.5; // In days, min value 0.25 day which equivalent to 6 hours
const minPercentPriceChange = +process.argv[4] || 1.5; // Price Percentage Threshold, min value 1.25
const interval = +process.argv[5] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours
const month2 = process.argv[6] == "m2";
const skipper = !month2 ? /stable|no price/gim : /stable|no price|loser/gim;

// cur.strategies[0]
const cb = (cur) => cur.askBidSpreadPercentage <= 1 || skipper.test(cur.note); // /loser.*g1/gim
let pairs = Object.keys(currencies).filter((p) => cb(currencies[p]));

const getFilePath = (name) => `${process.cwd()}/database/logs/${name}.log`;
// const notProcessed = readFileSync(getFilePath("no-safety"));
// pairs = pairs.filter((p) => notProcessed.includes(p));

(async () => {
  for (const pair of pairs) {
    if (alreadyInProgress(pair)) continue;
    await runTradingTest(pair, minStrategyRange, minPercentPriceChange, modes, interval, month2);
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
