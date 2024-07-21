const fs = require("fs");
const crypto = require("crypto");
const credentials = require("./variable.json");

// Replace with your Kraken API key and secret
const allowedPercentageChange = 0.5;
const ethOderVolume = "0.0028"; // "0.003"
const ORDERS_FILE_PATH = "database.json";
const pair = "ETH/EUR";
const API_URL = "https://api.kraken.com";
const API_KEY = credentials.apiKey;
const API_SECRET = credentials.privateKey;

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
function removeOrders(orderIds) {
  let orders = loadState();
  updateState(orders.filter((order) => !orderIds.includes(order.id)));
}
function getOrdersByExchangeRate(currentRate) {
  let orders = loadState();
  return orders.filter(
    (order) => allowedPercentageChange < calculatePercentageChange(currentRate, order.exchangeRate)
  );
}

// Helper function to generate API signature
function getKrakenSignature(urlPath, data, secret) {
  if (typeof data != "object") throw new Error("Invalid data type");

  const encoded = data.nonce + JSON.stringify(data);

  const sha256Hash = crypto.createHash("sha256").update(encoded).digest();
  const message = urlPath + sha256Hash.toString("binary");
  const secretBuffer = Buffer.from(secret, "base64");
  const hmac = crypto.createHmac("sha512", secretBuffer);
  hmac.update(message, "binary");
  const signature = hmac.digest("base64");
  return signature;

  // const message = JSON.stringify(data);
  // const secret_buffer = Buffer.from(secret, "base64");
  // const hash = crypto.createHash("sha256");
  // const hmac = crypto.createHmac("sha512", secret_buffer);
  // const hash_digest = hash.update(data.nonce + message).digest("binary");
  // const hmac_digest = hmac.update(urlPath + hash_digest, "binary").digest("base64");

  // return hmac_digest;
}

const checkError = (res) => {
  if (!res.error[0]) return res.result;
  else throw new Error(res.error.reduce((acc, err) => acc + "\n" + err, ""));
};

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

// "OHLC Data" stands for Open, High, Low, Close data, which represents the prices at which an asset opens, reaches its highest, reaches its lowest, and closes during a specific time interval.
// const getPairData = (route = "OHLC", pair = "eth/eur", interval = 5) => {
//   // route: AssetPairs / OHLC`
//   return `/0/public/${route}?pair=${pair}&interval=${interval}`;
// };

// https://api.kraken.com/0/public/AssetPairs?pair=eth/eur

// Function to calculate EMA (Exponential Moving Average)
// Note: EMA is a type of moving average that gives more weight to recent prices, making it more responsive to recent price changes compared to a simple moving average.
const calculateEMA = (prices, period) => {
  const k = 2 / period;
  return prices.reduce((acc, price, index) => (index === 0 ? price : price * k + acc * (1 - k)), 0); // First EMA value is the first price
};

// Function to calculate RSI (Relative Strength Index)

// Note:
// When RSI rise means the market is moving upward, and prices are likely to keep rising. It indicates strong buying interest and positive market sentiment.
// When the RSI is very low, suggesting that the asset is likely in oversold conditions, which could indicate a potential buying opportunity if the price stabilizes.

// The 30 to 70 range for RSI is commonly used because:
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
  return 100 - 100 / (1 + rs);
};

const tradingBot = async () => {
  try {
    // https://api.kraken.com/0/public/Ticker?pair=ETHEUR
    // let currentPricesResponse = await krakenApi(`/Ticker?pair=${pair}`);
    // const currentPrice2 = parseFloat(currentPricesResponse[pair].c[0]); // Current price (last trade)

    let prices = await krakenApi(`/OHLC?pair=${pair}&interval=1`);
    prices = prices[pair].map((candle) => parseFloat(candle[4])); // Closing prices
    const currentPrice = prices[prices.length - 1];
    const previousPrice = prices[prices.length - 1 - 5]; // The price 5 mins ago

    const shortEMA = calculateEMA(prices.slice(-21), 10); // Last 9 periods
    const longEMA = calculateEMA(prices.slice(-21), 22); // Last 21 periods
    const rsi = calculateRSI(prices.slice(-14)); // Last 14 periods
    const percentageChange = calculatePercentageChange(currentPrice, previousPrice);

    // Get current balance
    // const balance = await krakenPrivateApi("Balance");
    // console.log("Current balance:", balance);

    // const openOrders = await krakenPrivateApi("OpenOrders");
    // console.log("openOrders:", openOrders.open);

    // const closedOrders = await krakenPrivateApi("ClosedOrders");
    // console.log("closedOrders:", closedOrders.closed);

    console.log("Price 5 mins ago: ", previousPrice);
    console.log("Current price: ", currentPrice);
    console.log("Percentage change in the last 5 mins: ", percentageChange);
    console.log(`Short EMA: ${shortEMA}, Long EMA: ${longEMA}, RSI: ${rsi}`);

    if (rsi <= 10 && percentageChange <= -allowedPercentageChange) {
      console.log("Suggest buying crypto because the price rose / increased");

      // if (+balance.ZEUR > 0) {
      //   // Buy here
      //   const data = JSON.stringify({
      //     type: "buy",
      //     ordertype: "market",
      //     pair: "XETHZEUR",
      //     volume: ethOderVolume,
      //   });

      //   const order = await krakenPrivateApi("AddOrder", data);
      //   addOrder({
      //     id: order.id,
      //     exchangeRate: order.price,
      //     volume: order.volume,
      //     volumePrice: order.price * ethOderVolume,
      //   });
      // }

      addOrder({
        id: crypto.randomUUID(),
        exchangeRate: currentPrice,
        volume: ethOderVolume,
        volumePrice: currentPrice * ethOderVolume,
      });
    } else if (rsi > 70 && percentageChange >= allowedPercentageChange) {
      console.log("Suggest selling crypto because the price dropped");

      // if (+balance.XETH > 0) {
      //   // Sell these order back
      //   const orders = getOrdersByExchangeRate(currentPrice);
      //   await Promise.all(
      //     orders.map(async (o) => {
      //       const data = JSON.stringify({
      //         type: "sell",
      //         ordertype: "market",
      //         pair: "XETHZEUR",
      //         volume: o.volume,
      //       });

      //       await krakenPrivateApi("AddOrder", data);
      //       removeOrders([o]);
      //     })
      //   );
      // }

      const orders = getOrdersByExchangeRate(currentPrice);
      const gains = orders.reduce(
        (total, order) => total + (currentRate * order.volume - order.volumePrice),
        0
      );
      console.log("gains: ", gains);
      removeOrders(orders.map((o) => o.id));
    } else {
      console.log("Suggest waiting for the price to change");
    }
    console.log(`\n`);
  } catch (error) {
    console.error("Error running bot:", error);
  }
};

tradingBot();
setInterval(tradingBot, 60000 * 10);

/* ========== Old code ========== */

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
