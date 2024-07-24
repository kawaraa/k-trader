/*
This strategy based on 5 to 8 mins interval and checking the last 4 hours on every 5 mins change:
1. Buy if price 1, 2, or 3 up to 24 drops 1.5% 
2. Sell if current price is 1.5% higher than the order price 
*/

const fs = require("fs");
const crypto = require("crypto");
const credentials = require("./variable.json");

// Replace with your Kraken API key and secret
const allowedPercentageChange = 1.4; // percentageMargin
const cryptoTradingAmount = "0.0028"; // "0.003"
const ORDERS_FILE_PATH = "database.json";
const pair = "ETH/EUR";
const API_URL = "https://api.kraken.com";
const API_KEY = credentials.apiKey;
const API_SECRET = credentials.privateKey;
const minMs = 60000;

class Order {
  constructor(type, tradingType, pair, volume) {
    this.type = type;
    this.ordertype = tradingType;
    this.pair = volume ? pair : "XETHZEUR";
    this.volume = volume;
  }
}

// Function to load the state from a JSON file
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(ORDERS_FILE_PATH, "utf8"));
  } catch (error) {
    return [];
  }
}
// Function to save the state to a JSON file
function updateState(state) {
  fs.writeFileSync(ORDERS_FILE_PATH, JSON.stringify(state, null, 2));
}
function addOrder(order) {
  let orders = loadState();
  orders.push(order);
  updateState(orders);
}
function removeOrders(orderId) {
  updateState(loadState().filter((order) => order.id !== orderId));
}
function getOrdersLowerThanCurrentPrice(currentPrice) {
  let orders = loadState();
  return orders.filter(
    (order) => allowedPercentageChange <= calculatePercentageChange(currentPrice, order.price)
  );
}

// Helper function to generate API signature
function getKrakenSignature(urlPath, data, secret) {
  if (typeof data != "object") throw new Error("Invalid data type");

  const secret_buffer = Buffer.from(secret, "base64");
  const hash = crypto.createHash("sha256");
  const hmac = crypto.createHmac("sha512", secret_buffer);
  const hash_digest = hash.update(data.nonce + JSON.stringify(data)).digest("binary");
  const signature = hmac.update(urlPath + hash_digest, "binary").digest("base64");
  return signature;

  /* ===== Delete this when place oder works fine ===== */
  // const encoded = data.nonce + JSON.stringify(data);
  // const sha256Hash = crypto.createHash("sha256").update(encoded).digest();
  // const message = urlPath + sha256Hash.toString("binary");
  // const secretBuffer = Buffer.from(secret, "base64");
  // const hmac = crypto.createHmac("sha512", secretBuffer);
  // hmac.update(message, "binary");
  // const signature = hmac.digest("base64");
  // return signature;
}

const checkError = (res) => {
  if (!res.error[0]) return res.result;
  else throw new Error(res.error.reduce((acc, err) => acc + "\n" + err, ""));
};
function parseNumbers(data) {
  for (const key in data) data[key] = +data[key];
  return data;
}

function krakenApi(path, options) {
  return fetch(`${API_URL}/0/public${path}`, options)
    .then((res) => res.json())
    .then(checkError);
}

// Function to make a private API call
async function krakenPrivateApi(path, data = {}) {
  path = `/0/private/${path}`;
  data.nonce = Date.now() * 1000;
  const body = JSON.stringify(data);
  const signature = getKrakenSignature(path, data, API_SECRET);

  return fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "API-Key": API_KEY,
      "API-Sign": signature,
    },
    method: "POST",
    body,
  })
    .then((res) => res.json())
    .then(checkError);
}

function calculatePercentageChange(currentPrice, pastPrice, returnString) {
  if (!(pastPrice >= 0 || currentPrice >= 0)) {
    throw new Error(`"currentPrice" and "pastPrice" values must be integer greater than zero.`);
  }
  const change = (((currentPrice - pastPrice) / pastPrice) * 100).toFixed(2);
  return !returnString ? change : `The price ${change < 0 ? "drops" : "increases"} ${change}%`;
}
function calculateEarnings(currentPrice, previousPrice, investedAmount) {
  const investedAmountIncludedProfit = (investedAmount / previousPrice) * currentPrice;
  const earnings = investedAmountIncludedProfit - investedAmount;
  return earnings.toFixed(2);
}
function calculateProfit(currentPrice, orderPrice, cryptoVolume) {
  const cost = orderPrice * cryptoVolume;
  const revenue = currentPrice * cryptoVolume;
  const profit = revenue - cost;
  return profit;
}

// Function to calculate EMA (Exponential Moving Average)
// Note: EMA is a type of moving average that gives more weight to recent prices, making it more responsive to recent price changes compared to a simple moving average.
const calculateEMA = (prices, period) => {
  const k = 2 / period;
  return parseInt(prices.reduce((acc, p, i) => (i === 0 ? p : p * k + acc * (1 - k)), 0));
  // First EMA value is the current price
};

// Function to calculate RSI (Relative Strength Index):
// 1. When RSI rise means the market is moving upward, and prices are likely to keep rising. It indicates strong buying interest and positive market sentiment.
// When the RSI is very low, suggesting that the asset is likely in oversold conditions, which could indicate a potential buying opportunity if the price stabilizes.
// 2. The 30 to 70 range for RSI is commonly used because:
// RSI above 70: Often indicates the asset is overbought and might be due for a pullback.
// RSI below 30: Typically signals that the asset is oversold and might be due for a rebound.
// These thresholds help identify potential reversal points in market trends.
const calculateRSI = (prices, period = 14) => {
  let gains = 0;
  let losses = 0;

  for (let i = 1; i < prices.length; i++) {
    const difference = prices[i] - prices[i - 1];
    if (difference >= 0) gains += difference;
    else losses -= difference;
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;
  const rs = averageGain / averageLoss;
  return parseInt(100 - 100 / (1 + rs));
};

const tradingBot = async () => {
  try {
    // Current price (last trade) => https://api.kraken.com/0/public/Ticker?pair=ETHEUR
    const currentPrice = parseFloat((await krakenApi(`/Ticker?pair=${pair}`))[pair].c[0]);
    let prices = (await krakenApi(`/OHLC?pair=${pair}&interval=5`))[pair];
    prices = prices.slice(prices.length - 48, prices.length - 2).map((candle) => parseFloat(candle[4]));
    // candle[4] is the Closing prices

    const shortEMA = calculateEMA(prices, 9); // was Last 9 periods
    const longEMA = calculateEMA(prices, 21); // was Last 21 periods
    const rsi = calculateRSI(prices.slice(-14)); // was Last 14 periods

    // Get current balance
    const balance = parseNumbers(await krakenPrivateApi("Balance"));
    console.log("Current balance => EUR: ", balance.ZEUR, "ETH: ", balance.XETH);
    console.log(`Short EMA: ${shortEMA} - `, `Long EMA: ${longEMA} - `, `RSI: ${rsi}`);

    // function findPriceWithinTimeFrame(timeIndex) {}
    const priceChanges = {
      lowest: { price: 0, minsAgo: 0, change: 0 },
      highest: { price: 0, minsAgo: 0, change: 0 },
    };
    let droppedPrice = false;

    for (let i = prices.length - 1; 0 <= i; i--) {
      // Testing
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

      if (priceChange <= -allowedPercentageChange) {
        droppedPrice = true;
        console.log("Price drops", priceChange, `% since ${(prices.length - i) * 5} mins`);

        i = -1;
      }
    }

    // Testing
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

    if (rsi <= 30 && droppedPrice) {
      console.log("Suggest buying crypto because the price dropped");

      if (balance.ZEUR > 0) {
        // Buy here
        const data = new Order("buy", "market", cryptoTradingAmount);
        const { txid } = await krakenPrivateApi("AddOrder", data);
        const { vol_exec, cost, fee, descr } = await krakenPrivateApi("QueryOrders", { txid });
        addOrder({ id: txid, price: +descr.price, volume: +vol_exec, cost: +cost + +fee });
      }
    }

    const orders = getOrdersLowerThanCurrentPrice(currentPrice);

    if (rsi > 70 && orders[0]) {
      console.log("Suggest selling crypto because the price rose / increased");

      if (balance.XETH > 0) {
        // Sell these order back
        for (const { id, volume } of orders) {
          await krakenPrivateApi("AddOrder", new Order("sell", "market", Math.min(volume, balance.XETH)));
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
// const order = (await krakenPrivateApi("QueryOrders", { txid: orderId }))[orderId];
// console.log("Pair: ", order.descr.pair);
// console.log("Type: ", order.descr.type);
// console.log("Status: ", order.status);
// console.log("Price: ", +order.price); // the exchange price rate in selected currency
// console.log("Volume: ", +order.vol_exec); // Cryptocurrency volume
// console.log("Cost: ", +order.cost); // The cost paid in selected currency
// console.log("Paid Volume: ", +order.vol); // The volume that is paid, could be EUR or Cryptocurrency
// console.log("Fee: ", +order.fee); // The fee in selected currency

// const openOrders = await krakenPrivateApi("OpenOrders");
// console.log("openOrders:", openOrders.open);

// const closedOrders = await krakenPrivateApi("ClosedOrders");
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
//     const content = fileContent || JSON.parse(fs.readFileSync(__dirname + this.name));
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
