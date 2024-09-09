// const { readdirSync } = require("node:fs");
// const { calcPercentageDifference } = require("./trend-analysis");
const currencies = require("./currencies.json");
console.log(Object.keys(currencies).length); // 283

// const pricesFolderPath = `${process.cwd()}/database/prices/`;
// const fileNames = readdirSync(pricesFolderPath);

// for (const fileName of fileNames) {
//   const pair = fileName.replace(".json", "");
//   const { askPrice, bidPrice, tradePrice } = require(`${pricesFolderPath}${fileName}`)[0];
//   let difference = calcPercentageDifference(bidPrice, askPrice);
//   difference = +((difference < 0.1 ? 0.1 : difference + 0.1) / 2).toFixed(2);

//   if (!currencies[pair]) currencies[pair] = { askBidSpreadPercentage: difference };
//   else currencies[pair].askBidSpreadPercentage = difference;
// }

// console.log(JSON.stringify(currencies));
