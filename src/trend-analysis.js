// Linear Regression Analysis method is used to analyze a series of price data for a cryptocurrency or other asset to determine the trend direction. is generally more suited for long-term trading.
function linearRegression(prices) {
  const n = prices.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += prices[i];
    sumXY += i * prices[i];
    sumXX += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  return slope > 0 ? "buy" : "sell";
  // If the slope is positive, it indicates an upward trend, which typically suggests buying in anticipation of further gains. Conversely, if the slope is negative, it indicates a downward trend, suggesting selling to avoid further losses.
  // 1. Positive Slope: Indicates an upward trend, which could be a signal to buy.
  // 2. Negative Slope: Indicates a downward trend, which could be a signal to sell.
}

// Simple Moving Average (SMA) method is used to calculate the average of past prices. adjust the period to any desired period that better match your analysis needs, for example:
// 1. Day Traders: Might use shorter periods like 5 or 10 to capture quick market movements.
// 2. Swing Traders: Might prefer periods like 20 or 50 to identify intermediate trends.
// 3. Long-Term Investors: Might use periods like 100 or 200 to focus on long-term trends.
function simpleMovingAverage(prices, period) {
  if (period < 1 || period > prices.length) {
    throw new Error("Invalid period. Must be between 1 and the length of the prices array.");
  }

  const sma = [];
  for (let i = 0; i <= prices.length - period; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i + j];
    }
    sma.push(sum / period);
  }

  const lastPrice = prices[prices.length - 1];
  const lastSMA = sma[sma.length - 1]; // the average of recent prices
  return lastPrice > lastSMA ? "buy" : "sell";
  // Trend Indicator:
  // 1. When SMA Above Last Price or the SMA is higher than the current price, means that the price is trending downwards signaling a potential buying opportunity if the trend is expected to reverse.
  // 2. When SMA Below Last Price, means an upward trend, signaling a potential selling opportunity if the trend is expected to reverse.
}

// Relative Strength Index (RSI) method is designed to compute the (RSI), which is a momentum oscillator used to measure the speed and change of price movements. It ranges from 0 to 100 and is used to identify overbought or oversold conditions.
// - When RSI rise means the market is moving upward, and prices are likely to keep rising. It indicates strong buying interest and positive market sentiment.
// - When the RSI is very low, suggesting that the asset is likely in oversold conditions, which could indicate a potential buying opportunity if the price stabilizes.

// calcRelativeStrengthIndex
function calculateRSI(prices, period = 14) {
  if (prices.length < period) throw new Error("Not enough data to calculate RSI.");
  // The 14-period setting for the RSI was recommended by J. Welles Wilder, the developer of the RSI, in his book "New Concepts in Technical Trading Systems." This default period is widely used because it has been found to provide a good balance between responsiveness and reliability in identifying overbought and oversold conditions across various markets.

  let gains = 0;
  let losses = 0;
  let rsi = 100;

  // Calculate initial average gains and losses
  for (let i = 1; i < period; i++) {
    const difference = prices[i] - prices[i - 1];
    if (difference > 0) gains += difference;
    else losses -= difference;
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;

  // Calculate RSI
  for (let i = period; i < prices.length; i++) {
    const difference = prices[i] - prices[i - 1];
    const gain = difference > 0 ? difference : 0;
    const loss = difference < 0 ? -difference : 0;

    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;

    const rs = averageLoss === 0 ? 100 : averageGain / averageLoss;
    rsi = 100 - 100 / (1 + rs);
    // The RSI values are typically collected over time; here we're just calculating the latest RSI
  }

  // if (rsi > 70) return "sell"; // Consider selling if the RSI indicates overbought conditions
  // else if (rsi < 30) return "buy"; // Consider buying if the RSI indicates oversold conditions
  // return "hold"; // No clear signal; hold the position or wait for better conditions
  return parseInt(rsi);

  // - The 30 to 70 range for RSI is commonly used because:
  // 1. RSI above 70: Often indicates the asset is overbought and might be due for a pullback.
  // 2. RSI below 30: Typically signals that the asset is oversold and might be due for a rebound.
}

function findHighLowPriceChanges(prices, currentPrice) {
  // const sortedPrices = prices.sorted();
  // const lowestChange = calcPercentageDifference( sortedPrices[0], currentPrice);
  // const highestChange = calcPercentageDifference( sortedPrices[sortedPrices.length - 1], currentPrice);

  const priceChanges = {
    lowest: { price: currentPrice, minsAgo: 0, percent: 0 },
    highest: { price: currentPrice, minsAgo: 0, percent: 0 },
  };
  for (let i = prices.length - 1; 0 <= i; i--) {
    if (priceChanges.highest.price < prices[i]) {
      priceChanges.highest.price = prices[i];
      priceChanges.highest.minsAgo = (prices.length - 1 - i) * 5;
    } else if (priceChanges.lowest.price > prices[i]) {
      priceChanges.lowest.price = prices[i];
      priceChanges.lowest.minsAgo = (prices.length - 1 - i) * 5;
    }
  }
  priceChanges.highest.percent = -calcPercentageDifference(priceChanges.highest.price, currentPrice);
  priceChanges.lowest.percent = -calcPercentageDifference(priceChanges.lowest.price, currentPrice);
  return priceChanges;
}

function detectPriceShape(prices, percentage) {
  const result = { shape: "unknown", value: null };
  const third = parseInt(prices.length / 3);
  const lastPrices = prices[prices.length - 1];
  if (prices.length < 3) return null; // Not enough points for a shape

  const inTheMiddle = (index) => index >= third - 1 && index <= third * 2 - 1;

  const minPrice = (result.value = Math.min(...prices));
  const VShape =
    calcPercentageDifference(prices[0], minPrice) <= -percentage &&
    calcPercentageDifference(minPrice, lastPrices) >= percentage;
  result.shape = "V"; // Check for "V" shape

  if (inTheMiddle(prices.indexOf(minPrice)) && VShape) return result;

  const maxPrice = (result.value = Math.max(...prices));
  const AShape =
    calcPercentageDifference(prices[0], maxPrice) >= percentage &&
    calcPercentageDifference(maxPrice, lastPrices) <= -percentage;
  result.shape = "A"; // Check for "A" shape
  if (inTheMiddle(prices.indexOf(maxPrice)) && AShape) return result;

  return result; // No clear "V" or "A" shape
}

function calcAveragePrice(prices) {
  if (prices.length === 0) throw new Error("Price list cannot be empty.");
  const total = prices.reduce((sum, price) => sum + price, 0);
  return +(total / prices.length).toFixed(8);
}

function calcPercentageDifference(oldPrice, newPrice) {
  const difference = newPrice - oldPrice;
  return +(newPrice > oldPrice ? (100 * difference) / newPrice : (difference / oldPrice) * 100).toFixed(2);
}

// This calculates the earnings from an investment given the current price, previous price, and invested amount.
function calcInvestmentProfit(previousPrice, currentPrice, investedAmount) {
  const earningsIncludedProfit = (investedAmount / previousPrice) * currentPrice;
  return +(earningsIncludedProfit - investedAmount).toFixed(8); // Return the Profit;
}

// This calculates the profit from a transaction given the current price, order price, and volume of cryptoCur.
function calcTransactionProfit(previousPrice, currentPrice, assetVolume, feePercentage) {
  const cost = previousPrice * assetVolume + calculateFee(previousPrice * assetVolume, feePercentage);
  const revenue = currentPrice * assetVolume - calculateFee(currentPrice * assetVolume, feePercentage);
  return revenue - cost; // profit
}

function calculateFee(amount, feePercentage) {
  return !feePercentage ? 0 : (amount * feePercentage) / 100;
}

function isOlderThen(timestamp, hours) {
  return (Date.now() - new Date(timestamp || Date.now()).getTime()) / 60000 / 60 > hours;
}

function getSupportedModes() {
  return ["on-decrease", "on-drop", "on-v-shape"];
}

// Methods for testing only:
function adjustPrice(price, percentage) {
  // This increases the tradePrice 0.10% by multiply it by 1.001, And decreases the tradePrice 0.10%, by multiply it by 0.999
  const multiplier = percentage / 100;
  return { tradePrice: price, askPrice: price * (1 + multiplier), bidPrice: price * (1 - multiplier) };
}

function countPriceChanges(prices, percentageThreshold, offset = 864) {
  const changes = [];
  // Find the lowest price in the last 3 days (864) based on 5 mins interval
  let picePointer = prices.slice(0, offset).sort()[0];

  for (let i = offset - 10; i < prices.length; i++) {
    const change = calcPercentageDifference(picePointer, prices[i]);
    const negative = change >= percentageThreshold && (changes.at(-1) || -1) <= 0;
    const positive = -percentageThreshold >= change && (changes.at(-1) || 1) > 0;
    if (negative || positive) {
      changes.push(change);
      picePointer = prices[i];
    }
  }
  return { changes, avgPeriod: +((prices.length * 5) / changes.length / 60 / 24).toFixed(2) };
}

module.exports = {
  linearRegression,
  simpleMovingAverage,
  calculateRSI,
  findHighLowPriceChanges,
  detectPriceShape,
  calcAveragePrice,
  calcPercentageDifference,
  countPriceChanges,
  calcInvestmentProfit,
  calcTransactionProfit,
  calculateFee,
  adjustPrice,
  isOlderThen,
  getSupportedModes,
};
