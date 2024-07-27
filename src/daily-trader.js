/*
This strategy based on 5 to 8 mins interval and checking the last 4 hours on every 5 mins change:
1. Buy if price 1, 2, or 3 up to 24 drops 1.5% 
2. Sell if current price is 1.5% higher than the order price

Recommendation:
- if it's daily trading strategy, buy when the current price is 1.5% lower then any price in the last 4 hours
- if it's monthly trading strategy, buy when the current price is 1.5% lower then the average price in the last 5 days
*/

const Kraken = require("./kraken.js");
const { Logger } = require("k-utilities");
const analyzer = require("./trend-analysis.js");
const OrderState = require("./order-state.js");
const { parseNumbers, minMs } = require("./utilities.js");
const kraken = new Kraken(require("../.env.json"));
const currencyBalance = { btc: "XXBT", eth: "XETH", sol: "SOL" };

class Order {
  constructor(type, tradingType, pair, volume) {
    this.type = type;
    this.ordertype = tradingType;
    this.pair = pair.replace("/", "");
    this.volume = volume;
  }
}

module.exports = class DailyTrader {
  #pair;
  #pricePercentageThreshold;
  #tradingAmount;
  constructor(name, strategy, pair, allowedPercentageChange, cryptoTradingAmount) {
    this.name = name;
    this.strategy = strategy;
    this.logger = new Logger(name + "-daily-trader", true);
    this.orderState = new OrderState(`${name}-orders.json`);
    this.#pair = pair;
    this.#pricePercentageThreshold = allowedPercentageChange; // percentageMargin
    this.#tradingAmount = cryptoTradingAmount;
  }

  async start(period = 4) {
    try {
      // Get current balance
      const balance = parseNumbers(await kraken.privateApi("Balance"));
      const availableEuro = balance.ZEUR;
      const availableCrypto = balance[currencyBalance[this.name]];

      // Current price (last trade) => https://api.kraken.com/0/public/Ticker?pair=ETHEUR
      const currentPrice = parseFloat(
        (await kraken.publicApi(`/Ticker?pair=${this.#pair}`))[this.#pair].c[0]
      );
      const prices = await kraken.getPrices(this.#pair).slice(-240); // since 4 hours

      const rsi = analyzer.calculateRSI(prices);
      const changes = analyzer.findHighLowPriceChanges(prices.slice(-120), currentPrice); // last 2 hours

      let decision = "hold";
      if (this.strategy == "average-price") {
        decision = analyzer.calculateAveragePrice(prices, this.#pricePercentageThreshold, currentPrice);
      } else if (this.strategy == "highest-price") {
        // const droppedPrice = changes.highest.percent <= -this.#pricePercentageThreshold;
        if (changes.highest.percent <= -this.#pricePercentageThreshold) decision = "buy";
        if (this.#pricePercentageThreshold <= changes.lowest.percent) decision = "sell";
      }

      // Testing Starts
      this.logger.info("Current balance => eur: ", availableEuro, `${this.name}: `, availableCrypto);
      this.logger.info(
        `RSI: ${rsi} - Average:`,
        analyzer.calculateAveragePrice(prices),
        "Current:",
        currentPrice,
        `change: "${analyzer.calculatePercentageChange(
          currentPrice,
          analyzer.calculateAveragePrice(prices)
        )}%" => ${decision}`
      );

      this.logger.info(
        `Lowest:`,
        changes.lowest.price,
        `=> ${changes.lowest.percent}% - ${changes.lowest.minsAgo}mins ago <|>`,
        `Highest:`,
        changes.highest.price,
        `=> ${changes.highest.percent}% - ${changes.highest.minsAgo}mins ago`
      );
      // Testing Ends

      if (decision == "buy" && rsi <= 35) {
        this.logger.info("Suggest buying crypto because the price dropped");

        // calculates the amount of a cryptocurrency that can be purchased given current balance in fiat money and the price of the cryptocurrency.
        const amount = +Math.min(
          this.#tradingAmount,
          (availableEuro - (availableEuro / 100) * 0.4) / currentPrice
        ).toFixed(4);

        if (availableEuro > 0 && amount > this.#tradingAmount / 2) {
          // Buy here
          const data = new Order("buy", "market", this.#pair, amount + "");
          const txid = (await kraken.privateApi("AddOrder", data)).txid[0];
          const { vol_exec, cost, fee, price } = (await kraken.privateApi("QueryOrders", { txid }))[txid];
          this.orderState.addOrder(txid, +price, +vol_exec, +cost + +fee);
          this.logger.warn(`Bought crypto with order ID "${txid}"`);
        }
      }

      // Get Orders that have price Lower Than the Current Price
      let orders = this.orderState.getOrders(
        (order) =>
          this.#pricePercentageThreshold <= analyzer.calculatePercentageChange(currentPrice, order.price)
      );

      if (70 <= rsi) {
        this.logger.info("Suggest selling crypto because the price rose / increased");
        // Backlog: Sell accumulated orders that has been more than 4 days if the current price is higher then highest price in the lest 4 hours.
        if (changes.highest.price <= currentPrice || 0 <= changes.highest.change) {
          const period = minMs * 60 * 24 * 4;
          orders = orders.concat(
            this.orderState.getOrders((o) => period <= Date.now() - Date.parse(o.timeStamp))
          );
        }
      }

      if (availableCrypto > 0 && orders[0]) {
        // Sell these order back
        for (const { id, volume } of orders) {
          await kraken.privateApi(
            "AddOrder",
            new Order("sell", "market", this.#pair, Math.min(volume, availableCrypto) + "")
          );
          this.orderState.removeOrders([id]);
          this.logger.warn(`Sold crypto with order ID "${id}"`);
        }
      }

      if (!(decision == "buy" && rsi <= 35) && !(70 <= rsi)) {
        this.logger.info("Suggest waiting for the price to change...");
      }
    } catch (error) {
      this.logger.error("Error running bot:", error);
    }

    console.log(`\n`);
    setTimeout(() => this.start(), minMs * (Math.round(Math.random() * 3) + period));
  }
};

/* ========== Old code ========== */

/* ===== Prices data ===== */
// https://api.kraken.com/0/public/AssetPairs?pair=eth/eur&interval=5
// https://api.kraken.com/0/public/OHLC?pair=eth/eur&interval=5
// "OHLC Data" stands for Open, High, Low, Close data, which represents the prices at which an asset opens, reaches its highest, reaches its lowest, and closes during a specific time interval.
// const getPairData = (route = "OHLC", pair = "eth/eur", interval = 5) => {
//   // route: AssetPairs / OHLC`
//   return `/0/public/${route}?pair=${pair}&interval=${interval}`;
// };

/* ===== Order data ===== */
// const openOrders = await kraken.privateApi("OpenOrders");
// console.log("openOrders:", openOrders.open);
// const closedOrders = await kraken.privateApi("ClosedOrders");
// console.log("closedOrders:", closedOrders.closed);
