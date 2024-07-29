const { readdirSync, readFileSync, writeFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");

const analyzer = require("./trend-analysis.js");
const folderPath = `${process.cwd()}/data`;
const monthDays = 30;
const eurAmount = 10;
const percentageThreshold = 1.5;
const strategy = "highest-price";
const oscillatorOffset = 96;

// Main function to get average number of significant changes per day
async function getAverageChanges() {
  // Get supported cryptocurrencies
  const files = readdirSync(`${process.cwd()}/data`);

  for (const file of files) {
    let eurBalance = 100;
    let cryptoBalance = 0;
    const prices = JSON.parse(readFileSync(`${folderPath}/${file}`, "utf8")).last30DaysPrices;
    const numberOfDailyPrices = Math.ceil(prices.length / monthDays);
    const tradingAmount = +(eurAmount / prices[0]).toFixed(4);
    const crypto = file.replace(".json", "");
    let orders = [];
    // const changes = [];
    console.log("Balance => Eur:", eurBalance, "- Crypto:", cryptoBalance);

    for (const i in prices) {
      if (i < oscillatorOffset) continue;
      // const days = i/ numberOfDailyPrices
      // if (days ) console.log(`Day ${i - numberOfDailyPrices}`);

      const price = prices[i];
      const limitedPrices = prices.slice(i - oscillatorOffset, i);
      const rsi = analyzer.calculateRSI(limitedPrices);
      const sortedPrices = prices.slice(i - 24, i).sort(); // last 2 hours
      const highestPrice = sortedPrices[sortedPrices.length - 1];
      const lowestChange = analyzer.calculatePercentageChange(price, sortedPrices[0]);
      const highestChange = analyzer.calculatePercentageChange(price, highestPrice);

      let decision = "hold";
      if (strategy == "average-price") {
        decision = analyzer.calculateAveragePrice(limitedPrices, price, percentageThreshold);
      } else if (strategy == "highest-price") {
        if (highestChange <= -percentageThreshold) decision = "buy";
        if (percentageThreshold <= lowestChange) decision = "sell";
      }

      // const averagePrice = analyzer.calculateAveragePrice(limitedPrices);
      // console.log(
      //   i,
      //   `RSI: ${rsi} - Current:`,
      //   price,
      //   `=> ${decision}`,
      //   "- Lowest:",
      //   sortedPrices[0],
      //   "- Average:",
      //   averagePrice,
      //   `${analyzer.calculatePercentageChange(price, averagePrice)}%`,
      //   "- Highest:",
      //   sortedPrices[sortedPrices.length - 1],
      //   `${highestChange}%`
      // );

      if (decision == "buy" && rsi <= 35) {
        // console.log("Suggest buying crypto because the price dropped");
        // Buy here
        if (eurAmount <= eurBalance) {
          const cost = eurAmount + (eurAmount / 100) * 0.4;
          addOrder(orders, randomUUID(), +price, tradingAmount, cost);
          eurBalance -= cost;
          cryptoBalance += tradingAmount;
          // console.warn(`Bought "${crypto}" crypto`);
        }
      }

      // Get Orders that have price Lower Than the Current Price
      const ordersForSale = orders.filter(
        (order) => percentageThreshold <= analyzer.calculatePercentageChange(price, order.price)
      );

      if (70 <= rsi) {
        // console.log("Suggest selling crypto because the price rose / increased");
        // // Backlog: Sell accumulated orders that has been more than 4 days if the current price is higher then highest price in the lest 4 hours.
        // if (highestPrice <= price || 0 <= highestChange) {
        //   const check = (o) => minMs * 60 * 24 * 4 <= Date.now() - Date.parse(o.timeStamp);
        //   orders = orders.concat(this.orderState.getOrders(check));
        // }
      }

      if (cryptoBalance > 0 && ordersForSale[0]) {
        // Sell these order back
        for (const { id, volume, cost } of ordersForSale) {
          Math.min(volume, cryptoBalance);
          eurBalance += cost;
          cryptoBalance -= tradingAmount;
          orders = removeOrders(orders, id);
          // console.warn(`Sold "${crypto}" crypto`);
        }
      }

      if (!(decision == "buy" && rsi <= 35) && !(70 <= rsi)) {
        // console.log("Suggest waiting for the price to change...");
      }
    }

    console.log("Balance => Eur:", eurBalance, "- Crypto:", cryptoBalance);
    break;
  }
}

function addOrder(orders, id, price, volume, cost) {
  orders.push({ id, price, volume, cost });
}
function removeOrders(orders, id) {
  return orders.filter((o) => o.id != id);
}

getAverageChanges(1.4);
