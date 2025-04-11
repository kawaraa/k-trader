// prices analysis script;

const { readdirSync, readFileSync } = require("node:fs");
const MyTrader = require("../trader/my-trader");
// const { runeTradingTest } = require("../indicators");
const trader = new MyTrader();

const pricesFolderPath = `${process.cwd()}/database/prices/test/`;
const pairArg = process.argv[2];
const fileNames = pairArg ? [`${pairArg}.json`] : readdirSync(pricesFolderPath);

for (const fileName of fileNames) {
  const pair = fileName.replace(".json", "");
  let prices = JSON.parse(readFileSync(`${pricesFolderPath}${fileName}`, "utf8"));

  // console.log(JSON.stringify(smoothPrices(prices, 12)));

  console.log("Range: 1.5hrs ", trader.runeTradingTest(prices, 18));
  console.log("Range: 3hrs ", trader.runeTradingTest(prices, 36));
}
