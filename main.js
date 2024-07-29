const Kraken = require("./src/kraken-ex-provider.js");
const DailyTrader = require("./src/daily-trader");

const kraken = new Kraken(require("./.env.json"));

const pair = process.argv[2]; // BTCEUR, ETHEUR, SOLEUR
const traderName = pair.replace("EUR", ""); // btc, eth, sol etc
// const strategy = process.argv[3] || "average-price"; // average-price or highest-price
// const pricePercentageThreshold = process.argv[4] || 1.5; // 0 to 100, default is 1.4
// const investingAmount = process.argv[5] || 10; // Investing Amount in EUR that will be used every time to by crypto
// const timeInterval = process.argv[5] || 4; // 1 to 11440, time per mins E.g. 11440 would be every 24 hours

// const trader = new DailyTrader(, strategy, pair, pricePercentageThreshold, cryptoTradingAmount);
// trader.start(timeInterval);

switch (traderName) {
  case "BTC":
    const btcTrader = new DailyTrader("btc", kraken, "BTCEUR", "average-price", 1.5, 10);
    btcTrader.start(7);
    break;
  case "ETH":
    const ethTrader = new DailyTrader("eth", kraken, "ETHEUR", "average-price", 1.4, 10);
    ethTrader.start(4);
    break;
  case "SOL":
    const solTrader = new DailyTrader("sol", kraken, "SOLEUR", "highest-price", 1.4, 10);
    solTrader.start(3);
    break;
  default:
    console.log(`"${trader}" is not a valid trader name!`);
}
