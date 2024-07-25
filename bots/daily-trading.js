/*
This strategy based on 5 to 8 mins interval and checking the last 4 hours on every 5 mins change:
1. Buy if price 1, 2, or 3 up to 24 drops 1.5% 
2. Sell if current price is 1.5% higher than the order price

Recommendation:
- if it's daily trading strategy, buy when the current price is 1.5% lower then any price in the last 4 hours
- if it's monthly trading strategy, buy when the current price is 1.5% lower then the average price in the last 5 days
*/

import Kraken from "../exchange-providers/kraken";
import credentials from "./variable.json" assert { type: "json" };
import calculateRSI from "../trend-analysis";
import OrderState from "../state/order-state";
import { calculatePercentageChange } from "../trend-analysis";

const allowedPercentageChange = 1.4; // percentageMargin
const cryptoTradingAmount = 0.0028; // 0.003
const pair = "ETH/EUR";
const minMs = 60000;

const kraken = new Kraken(credentials);
const orderState = new OrderState("orders.json");

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

const tradingBot = async () => {
  try {
    // Current price (last trade) => https://api.kraken.com/0/public/Ticker?pair=ETHEUR
    const currentPrice = parseFloat((await kraken.publicApi(`/Ticker?pair=${pair}`))[pair].c[0]);
    let prices = (await kraken.publicApi(`/OHLC?pair=${pair}&interval=5`))[pair];
    prices = prices.slice(prices.length - 48, prices.length - 2).map((candle) => parseFloat(candle[4]));
    // candle[4] is the Closing prices

    const rsi = calculateRSI(prices, 24); // was Last 14 periods

    // Get current balance
    const balance = parseNumbers(await kraken.privateApi("Balance"));
    console.log("Current balance => EUR: ", balance.ZEUR, "ETH: ", balance.XETH);
    console.log(`RSI: ${rsi}`);

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
    console.log(
      `Highest price "${priceChanges.highest.minsAgo}" mins ago:`,
      priceChanges.highest.price,
      "=>",
      currentPrice,
      "=>",
      `${priceChanges.highest.change}%`
    );
    console.log(
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
      if (priceChange <= -allowedPercentageChange) {
        droppedPrice = true;
        console.log("Price drops", priceChange, `% since ${(prices.length - i) * 5} mins`);
        i = -1;
      }
    }

    if (rsi <= 35 && droppedPrice) {
      console.log("Suggest buying crypto because the price dropped");

      const amount = Math.min(
        cryptoTradingAmount,
        (balance.ZEUR - (balance.ZEUR / 100) * 0.4) / currentPrice
      ).toFixed(4);

      if (balance.ZEUR > 0 && amount > 0.001) {
        // Buy here, "0.001" is the minimum accepted crypto amount in Kraken

        const data = new Order("buy", "market", "XETHZEUR", amount + "");

        const txid = (await kraken.privateApi("AddOrder", data)).txid[0];
        const { vol_exec, cost, fee, descr } = await kraken.privateApi("QueryOrders", { txid });
        addOrder(txid, +descr.price, +vol_exec, +cost + +fee);
      }
    }

    // Get Orders that have price Lower Than the Current Pric
    let orders = orderState.getOrders(
      (order) => allowedPercentageChange <= calculatePercentageChange(currentPrice, order.price)
    );

    if (70 <= rsi) {
      console.log("Suggest selling crypto because the price rose / increased");

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
          removeOrders({ id });
        }
      }
    }

    if (!(rsi <= 30 && droppedPrice) && !(rsi > 70 && orders[0])) {
      console.log("Suggest waiting for the price to change...");
    }

    console.log(`\n`);
  } catch (error) {
    console.error("Error running bot:", error);
  }

  setTimeout(tradingBot, minMs * (Math.round(Math.random() * 3) + 4)); // Every 5, 6 or 8 mins
};

tradingBot();

/* ========== Old code ========== */

// // Testing
// const gains = orders.reduce((total, o) => total + (currentPrice * o.volume - o.cost), 0);
// console.log("gains: ", gains);
// orders.map(removeOrders);

/* ===== Prices data ===== */
// https://api.kraken.com/0/public/AssetPairs?pair=eth/eur&interval=5
// https://api.kraken.com/0/public/OHLC?pair=eth/eur&interval=5
// "OHLC Data" stands for Open, High, Low, Close data, which represents the prices at which an asset opens, reaches its highest, reaches its lowest, and closes during a specific time interval.
// const getPairData = (route = "OHLC", pair = "eth/eur", interval = 5) => {
//   // route: AssetPairs / OHLC`
//   return `/0/public/${route}?pair=${pair}&interval=${interval}`;
// };

/* ===== Oder data ===== */
// const orderId = "O5UIYW-ZEABL-H6Q6KW"; // OESOIN-P3SS6-EVZR3L, O5UIYW-ZEABL-H6Q6KW
// const order = (await kraken.privateApi("QueryOrders", { txid: orderId }))[orderId];
// console.log("Pair: ", order.descr.pair);
// console.log("Type: ", order.descr.type);
// console.log("Status: ", order.status);
// console.log("Price: ", +order.price); // the exchange price rate in selected currency
// console.log("Volume: ", +order.vol_exec); // Cryptocurrency volume
// console.log("Cost: ", +order.cost); // The cost paid in selected currency
// console.log("Paid Volume: ", +order.vol); // The volume that is paid, could be EUR or Cryptocurrency
// console.log("Fee: ", +order.fee); // The fee in selected currency

// const openOrders = await kraken.privateApi("OpenOrders");
// console.log("openOrders:", openOrders.open);

// const closedOrders = await kraken.privateApi("ClosedOrders");
// console.log("closedOrders:", closedOrders.closed);

/* ===== Other code ===== */
// class OrdersQueue {
//   constructor() {
//     if (OrdersQueue.instance) return OrdersQueue.instance;
//     OrdersQueue.instance = this;

//     this.orders = [];
//     this.fileName = "orders.json";
//   }
//   updateOrdersFile(fileContent) {
//     const content = fileContent || JSON.parse(readFileSync(__dirname + this.name));
//   }

//   add() {}
//   remove() {}
// }

// class TradingBot {
//   constructor(percentageChange = 0.5, availableCashPercentage = 100) {
//     if (TradingBot.instance) return TradingBot.instance;
//     TradingBot.instance = this;

//     this.orders = new OrdersQueue();
//     this.entryPrice = 0;
//     this.availableCashPercentage = availableCashPercentage;
//     this.allowedPercentageChange = percentageChange;
//     this.previousPrice = 0;
//     this.apiCounter = 15; // Initialize with maximum allowed API counter
//     this.lastApiCall = Date.now(); // Track the last API call time
//     this.initializeState();
//   }

//   initializeState() {
//     this.entryPrice = 0; // 1. Get available cash, USD / EUR balance
//     this.previousPrice = 0; // 2. Get the price 5 or 10 mins ago
//   }

//   async ss() {
//     try {
//       await new Promise((resolve) => setTimeout(resolve, 1000));

//       const changePercent = calculatePercentageChange(currentPrice, this.previousPrice);
//       if (changePercent > this.allowedPercentageChange) {
//         const amount = (this.availableCashPercentage / this.entryPrice) * 100;
//         // Buy using this "amount"
//       } else if (changePercent < this.allowedPercentageChange) {
//       }

//       // 3. If the price change is greater then current, Buy, else
//     } catch (error) {}
//   }
// }

// const trader = new TradingBot();
// trader.start();
// setInterval(trader.start, 60000 * 5);
