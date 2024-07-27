const DailyTrader = require("./src/daily-trader");
const traderName = process.argv[2]; // btc, eth, sol
// const strategy = process.argv[3]; // average-price or highest-price
// const pair = process.argv[4]; // BTC/EUR, ETH/EUR, SOL/EUR
// const pricePercentageThreshold = process.argv[5]; // 0 to 100, default is 1.4
// const cryptoTradingAmount = process.argv[6]; // 0 to 1, float format E.g. 0.00016
// const timeInterval = process.argv[7]; // 1 to 11440, time per mins E.g. 11440 would be every 24 hours

// const trader = new DailyTrader(traderName, strategy, pair, pricePercentageThreshold, cryptoTradingAmount);
// trader.start(timeInterval);

switch (traderName) {
  case "btc":
    const btcTrader = new DailyTrader("btc", "average-price", "BTC/EUR", 1.4, 0.00016);
    btcTrader.start(7);
    break;
  case "eth":
    const ethTrader = new DailyTrader("eth", "average-price", "ETH/EUR", 1.2, 0.0028); // 0.003
    ethTrader.start(4);
    break;
  case "sol":
    const solTrader = new DailyTrader("sol", "highest-price", "SOL/EUR", 1.2, 0.059);
    solTrader.start(3);
    break;
  default:
    console.log(`"${trader}" is not a valid trader name!`);
}
