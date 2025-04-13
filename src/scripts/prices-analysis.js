// prices analysis script;

const { readdirSync, readFileSync } = require("node:fs");
const MyTrader = require("../trader/my-trader");
// const { runeTradingTest } = require("../indicators");
const trader = new MyTrader(null, null, 5);

const pricesFolderPath = `${process.cwd()}/database/prices/test/`;
const pairArg = process.argv[2];
const fileNames = pairArg ? [`${pairArg}.json`] : readdirSync(pricesFolderPath);

for (const fileName of fileNames) {
  const pair = fileName.replace(".json", "");
  let prices = JSON.parse(readFileSync(`${pricesFolderPath}${fileName}`, "utf8"));

  // console.log(JSON.stringify(smoothPrices(prices, 12)));

  console.log(trader.runeTradingTest(prices));
}
