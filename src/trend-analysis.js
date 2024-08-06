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
  // const lowestChange = calculatePercentageChange(currentPrice, sortedPrices[0]);
  // const highestChange = calculatePercentageChange(currentPrice, sortedPrices[sortedPrices.length - 1]);

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
  priceChanges.highest.percent = calculatePercentageChange(currentPrice, priceChanges.highest.price);
  priceChanges.lowest.percent = calculatePercentageChange(currentPrice, priceChanges.lowest.price);
  return priceChanges;
}

function calculateAveragePrice(prices, currentPrice, percentageChange) {
  if (prices.length === 0) throw new Error("Price list cannot be empty.");
  const total = prices.reduce((sum, price) => sum + price, 0);
  return +(total / prices.length).toFixed(8);
}

function calculatePercentageChange(currentPrice, pastPrice, returnString) {
  if (!(pastPrice >= 0 && currentPrice >= 0)) {
    throw new Error(`"currentPrice" and "pastPrice" values must be integer greater than zero.`);
  }
  const change = +(((currentPrice - pastPrice) / (pastPrice || 0)) * 100).toFixed(2);
  return !returnString ? change : `The price ${change < 0 ? "drops" : "increases"} ${change}%`;
}

function countPercentageChange(prices, percentageThreshold) {
  const changes = [];
  let picePointer = prices[0];

  for (let i = 1; i < prices.length; i++) {
    const change = calculatePercentageChange(picePointer, prices[i]);
    if (percentageThreshold <= change) {
      changes.push(change);
      picePointer = prices[i];
    } else if (change <= -percentageThreshold) {
      changes.push(change);
      picePointer = prices[i];
    }
  }
  return changes;
}

// This calculates the earnings from an investment given the current price, previous price, and invested amount.
function calculateEarnings(currentPrice, previousPrice, investedAmount) {
  const investedAmountIncludedProfit = (investedAmount / previousPrice) * currentPrice;
  const earnings = investedAmountIncludedProfit - investedAmount;
  return +earnings.toFixed(8);
}
// This calculates the profit from a transaction given the current price, order price, and volume of cryptoCur.
function calculateProfit(currentPrice, orderPrice, cryptoVolume, feePercentage) {
  const cost = orderPrice * cryptoVolume;
  const revenue = currentPrice * cryptoVolume;
  const profit = revenue - cost;
  const fee = !feePercentage ? 0 : (profit * feePercentage) / 100;
  return profit - fee;
}

module.exports = {
  linearRegression,
  simpleMovingAverage,
  calculateRSI,
  findHighLowPriceChanges,
  calculateAveragePrice,
  calculatePercentageChange,
  countPercentageChange,
  calculateEarnings,
  calculateProfit,
};
