// prices analysis script;

const { readdirSync } = require("node:fs");
const { countPriceChanges } = require("./trend-analysis");
const currencies = require("./currencies.json");
const pricesFolderPath = `${process.cwd()}/database/test-prices/`;
const pairArg = process.argv[2];
const minProfitPercentage = process.argv[3] || 10;
const minPercentageChange = process.argv[4] || 1.2;

const fileNames = pairArg ? [`${pairArg}.json`] : readdirSync(pricesFolderPath);

for (const fileName of fileNames) {
  const pair = fileName.replace(".json", "");
  let prices = require(`${pricesFolderPath}${fileName}`);

  console.log("There are", prices.length, "prices");
  if (prices.length < 18000 || currencies[pair].pricesChanges > 0) continue;
  console.log(`Started prices analysis for "${pair}" with ${prices.length} prices`);

  let percentage = minPercentageChange;
  while (percentage <= 25) {
    const result = countPriceChanges(prices, percentage);

    if (result.changes.at(-1) < 1) result.changes.pop();
    const pricesChanges = result.changes.filter((p) => p < -1).length / 2;
    const estimateProfitPercentage = parseInt(percentage * pricesChanges);

    if (estimateProfitPercentage >= minProfitPercentage) {
      console.log(
        "Pair:",
        pair,
        "Percentage:",
        +percentage.toFixed(2),
        "PricesChanges:",
        pricesChanges,
        "AvgPeriod:",
        result.avgPeriod,
        "EstimateProfitPercentage",
        estimateProfitPercentage
      );
    }
    percentage += percentage < 2 ? 0.1 : 0.5;
  }
}
