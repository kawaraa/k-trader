// Linear Regression Analysis
// - Determines the trend direction based on the slope. "buy" if the slope is positive, "sell" if negative.
export function linearRegression(prices) {
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
  const intercept = (sumY - slope * sumX) / n;

  const decision = slope > 0 ? "buy" : "sell";

  return { slope, intercept, decision };
}

// Simple Moving Average
// By adjusting the period to any desired period that better match your analysis needs, for example:
// 1. Day Traders: Might use shorter periods like 5 or 10 to capture quick market movements.
// 2. Swing Traders: Might prefer periods like 20 or 50 to identify intermediate trends.
// 3. Long-Term Investors: Might use periods like 100 or 200 to focus on long-term trends.
// Compares the latest price to the moving average. "buy" if the latest price is above the moving average, "sell" if below.
export function simpleMovingAverage(prices, period) {
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

  // Compare the last price to the last SMA value
  const lastPrice = prices[prices.length - 1];
  const lastSMA = sma[sma.length - 1];
  const decision = lastPrice > lastSMA ? "buy" : "sell";

  return { sma, decision };
}

// Function to calculate RSI (Relative Strength Index):
// 1. When RSI rise means the market is moving upward, and prices are likely to keep rising. It indicates strong buying interest and positive market sentiment.
// When the RSI is very low, suggesting that the asset is likely in oversold conditions, which could indicate a potential buying opportunity if the price stabilizes.
// 2. The 30 to 70 range for RSI is commonly used because:
// RSI above 70: Often indicates the asset is overbought and might be due for a pullback.
// RSI below 30: Typically signals that the asset is oversold and might be due for a rebound.
// These thresholds help identify potential reversal points in market trends.
export const calculateRSI = (prices, period = 14) => {
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

export function calculatePercentageChange(currentPrice, pastPrice, returnString) {
  if (!(pastPrice >= 0 || currentPrice >= 0)) {
    throw new Error(`"currentPrice" and "pastPrice" values must be integer greater than zero.`);
  }
  const change = (((currentPrice - pastPrice) / pastPrice) * 100).toFixed(2);
  return !returnString ? change : `The price ${change < 0 ? "drops" : "increases"} ${change}%`;
}
export function calculateEarnings(currentPrice, previousPrice, investedAmount) {
  const investedAmountIncludedProfit = (investedAmount / previousPrice) * currentPrice;
  const earnings = investedAmountIncludedProfit - investedAmount;
  return earnings.toFixed(2);
}
export function calculateProfit(currentPrice, orderPrice, cryptoVolume) {
  const cost = orderPrice * cryptoVolume;
  const revenue = currentPrice * cryptoVolume;
  const profit = revenue - cost;
  return profit;
}

// Example usage:
const prices = [
  3191.88, 3187.67, 3193.48, 3196.75, 3196.75, 3197.48, 3199.64, 3196.74, 3190.83, 3197.47, 3202.45, 3199.02,
  3199.02, 3199.12, 3198, 3194.99, 3194.24, 3189.54, 3189.58, 3191.59, 3193.65, 3195.04, 3196.24,
];

const lrResult = linearRegression(prices);
console.log(
  `Linear Regression - Slope: ${lrResult.slope}, Intercept: ${lrResult.intercept}, Decision: ${lrResult.decision}`
);

const smaResult = simpleMovingAverage(prices, 10);
console.log(`10-Period SMA: ${smaResult.sma}, Decision: ${smaResult.decision}`);
