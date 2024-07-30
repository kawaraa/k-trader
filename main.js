const KrakenExchangeProvider = require("./src/kraken-ex-provider.js");
const DailyTrader = require("./src/daily-trader");

const kraken = new KrakenExchangeProvider(require("./.env.json"));

const pair = process.argv[2];
const name = pair.replace("EUR", "").toLocaleLowerCase(); // btc, eth, sol etc
const pricePercentage = process.argv[3] || 1.5; // price Percentage Threshold 0 to 100, default is 1.5
const investingAmount = process.argv[4] || 10; // Amount in EUR that will be used every time to by crypto
const safetyTimeline = process.argv[5] || 8; // Number of hours, Default is 8 hours, the max value is 60
const timeInterval = process.argv[6] || 5; // 1 to 11440, time per mins E.g. 11440 would be every 24 hours

// ADXEUR 1.5 10 8 3
// SOLEUR
const solTrader = new DailyTrader(name, kraken, pair, +pricePercentage, +investingAmount, +safetyTimeline);
solTrader.start(timeInterval);
