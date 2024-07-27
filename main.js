const DailyTrader = require("./bots/daily-trader");
const trader = process.argv[2];
// BTC/EUR, ETH/EUR, SOL/EUR

switch (trader) {
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
