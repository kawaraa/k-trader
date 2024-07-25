/*
This strategy based on 5 to 8 mins interval and checking the last 4 hours on every 5 mins change:
1. Buy if price 1, 2, or 3 up to 24 drops 1.5% 
2. Sell if current price is 1.5% higher than the order price

Recommendation:
- if it's daily trading strategy, buy when the current price is 1.5% lower then any price in the last 4 hours
- if it's monthly trading strategy, buy when the current price is 1.5% lower then the average price in the last 5 days
*/

import Kraken from "../exchange-providers/kraken.js";
import { Logger } from "k-utilities";
import { calculateRSI, simpleMovingAverage, calculatePercentageChange } from "../trend-analysis.js";
import credentials from "../variable.json" assert { type: "json" };
import OrderState from "../state/order-state.js";

const kraken = new Kraken(credentials);
const orderState = new OrderState("orders.json");
const logger = new Logger("Daily-trader", true);
const minMs = 60000;

class Order {
  constructor(type, tradingType, pair, volume) {
    this.type = type;
    this.ordertype = tradingType;
    this.pair = pair;
    this.volume = volume;
  }
}

function parseNumbers(data) {
  for (const key in data) data[key] = +data[key];
  return data;
}

export default class DailyTrader {
  #pair;
  #pricePercentageChange;
  #tradingAmount;
  constructor(pair, allowedPercentageChange, cryptoTradingAmount) {
    this.#pair = pair;
    this.#pricePercentageChange = allowedPercentageChange; // percentageMargin
    this.#tradingAmount = cryptoTradingAmount;
  }

  async start() {
    try {
      // Current price (last trade) => https://api.kraken.com/0/public/Ticker?pair=ETHEUR
      const currentPrice = parseFloat(
        (await kraken.publicApi(`/Ticker?pair=${this.#pair}`))[this.#pair].c[0]
      );
      const prices = await kraken.getPrices(this.#pair, 60 * 4);
      const rsi = calculateRSI(prices);

      // Get current balance
      const balance = parseNumbers(await kraken.privateApi("Balance"));
      logger.info("Current balance => EUR: ", balance.ZEUR, "ETH: ", balance.XETH);
      logger.info(`RSI: ${rsi}`, `SMA Decision: ${simpleMovingAverage(prices, 10)}`);

      // Testing
      const priceChanges = {
        lowest: { price: 0, minsAgo: 0, change: 0 },
        highest: { price: 0, minsAgo: 0, change: 0 },
      };
      for (let i = prices.length - 1; 0 <= i; i--) {
        const priceChange = calculatePercentageChange(currentPrice, prices[i]);

        if (+priceChange < +priceChanges.highest.change) {
          priceChanges.highest.price = prices[i];
          priceChanges.highest.change = priceChange;
          priceChanges.highest.minsAgo = (prices.length - 1 - i) * 5;
        } else if (+priceChange > +priceChanges.lowest.change) {
          priceChanges.lowest.price = prices[i];
          priceChanges.lowest.change = priceChange;
          priceChanges.lowest.minsAgo = (prices.length - 1 - i) * 5;
        }
      }
      logger.info(
        `Highest price "${priceChanges.highest.minsAgo}" mins ago:`,
        priceChanges.highest.price,
        "=>",
        currentPrice,
        "=>",
        `${priceChanges.highest.change}%`
      );
      logger.info(
        `Lowest price "${priceChanges.lowest.minsAgo}" mins ago:`,
        priceChanges.lowest.price,
        "=>",
        currentPrice,
        "=>",
        `${priceChanges.lowest.change}%`
      );

      let droppedPrice = false;
      for (let i = prices.length - 1; 0 <= i; i--) {
        const priceChange = calculatePercentageChange(currentPrice, prices[i]);
        if (priceChange <= -this.#pricePercentageChange) {
          droppedPrice = true;
          logger.info("Price drops", priceChange, `% since ${(prices.length - i) * 5} mins`);
          i = -1;
        }
      }

      if (rsi <= 35 && droppedPrice) {
        logger.info("Suggest buying crypto because the price dropped");

        const amount = Math.min(
          this.#tradingAmount,
          (balance.ZEUR - (balance.ZEUR / 100) * 0.4) / currentPrice
        ).toFixed(4);

        if (balance.ZEUR > 0 && amount > 0.001) {
          // Buy here, "0.001" is the minimum accepted crypto amount in Kraken

          const data = new Order("buy", "market", "XETHZEUR", amount + "");

          const txid = (await kraken.privateApi("AddOrder", data)).txid[0];
          const { vol_exec, cost, fee, descr } = await kraken.privateApi("QueryOrders", { txid });
          /* ===== Oder data ===== */
          // const orderId = "O5UIYW-ZEABL-H6Q6KW"; // OESOIN-P3SS6-EVZR3L, O5UIYW-ZEABL-H6Q6KW
          // const order = (await kraken.privateApi("QueryOrders", { txid: orderId }))[orderId];
          orderState.addOrder(txid, +descr.price, +vol_exec, +cost + +fee);
        }
      }

      // Get Orders that have price Lower Than the Current Price
      let orders = orderState.getOrders(
        (order) => this.#pricePercentageChange <= calculatePercentageChange(currentPrice, order.price)
      );

      if (70 <= rsi) {
        logger.info("Suggest selling crypto because the price rose / increased");

        // Backlog: Sell accumulated orders that has been more than 4 days if the current price is higher then highest price in the lest 4 hours.
        if (priceChanges.highest.price <= currentPrice || 0 <= priceChanges.highest.change) {
          const period = minMs * 60 * 24 * 4;
          orders = orders.concat(loadState().filter((o) => period <= Date.now() - Date.parse(o.timeStamp)));
        }

        if (balance.XETH > 0 && orders[0]) {
          // Sell these order back
          for (const { id, volume } of orders) {
            await kraken.privateApi(
              "AddOrder",
              new Order("sell", "market", "XETHZEUR", Math.min(volume, balance.XETH) + "")
            );
            orderState.removeOrders({ id });
          }
        }
      }

      if (!(rsi <= 30 && droppedPrice) && !(rsi > 70 && orders[0])) {
        logger.info("Suggest waiting for the price to change...");
      }

      console.log(`\n`);
    } catch (error) {
      logger.error("Error running bot:", error);
    }

    setTimeout(() => this.start(), minMs * (Math.round(Math.random() * 3) + 4)); // Every 5, 6 or 8 mins
  }
}

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
