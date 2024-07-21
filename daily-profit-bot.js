const KrakenClient = require("kraken-api");
const moment = require("moment");

// "Period" refers to the number of time intervals (e.g., minutes, hours, days) used to calculate indicators like EMA (Exponential Moving Average) and RSI (Relative Strength Index). For instance, a 9-period EMA uses the past 9 time intervals of price data to calculate the moving average.

// Initialize the Kraken API client
const kraken = new KrakenClient("YOUR_API_KEY", "YOUR_API_SECRET");

// Function to calculate EMA (Exponential Moving Average)
const calculateEMA = (prices, period) => {
  const k = 2 / period;
  return prices.reduce((acc, price, index) => (index === 0 ? price : price * k + acc * (1 - k)), 0); // First EMA value is the first price
};

// Function to calculate RSI (Relative Strength Index)
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

// Function to fetch OHLC data from Kraken
const fetchOHLCData = async (pair, interval = 1) => {
  const response = await kraken.api("OHLC", { pair, interval });
  return response.result[pair].map((candle) => parseFloat(candle[4])); // Closing prices
};

// Function to execute a trade
const executeTrade = async (type, volume) => {
  await kraken.api("AddOrder", {
    pair: "XETHZEUR",
    type,
    ordertype: "market",
    volume,
  });
  console.log(`${type} order executed for ${volume} ETH`);
};

// Trading strategy
const tradingStrategy = async () => {
  const prices = await fetchOHLCData("XETHZEUR");

  const shortEMA = calculateEMA(prices.slice(-21), 10); // Last 9 periods
  const longEMA = calculateEMA(prices.slice(-21), 22); // Last 21 periods
  const rsi = calculateRSI(prices.slice(-14)); // Last 14 periods

  console.log(`Short EMA: ${shortEMA}, Long EMA: ${longEMA}, RSI: ${rsi}`);

  if (shortEMA > longEMA && rsi > 30 && rsi < 70) {
    await executeTrade("buy", 0.01); // Example: buying 0.01 ETH
  } else if (shortEMA < longEMA && rsi < 70 && rsi > 30) {
    await executeTrade("sell", 0.01); // Example: selling 0.01 ETH
  }
};

// Schedule the trading strategy to run every minute
setInterval(tradingStrategy, 60 * 1000);
