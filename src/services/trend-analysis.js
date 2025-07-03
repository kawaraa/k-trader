// Linear Regression Analysis method is used to analyze a series of price data for a cryptocurrency or other asset to determine the trend direction. is generally more suited for long-term trading.

import { calcPercentageDifference } from "../../shared-code/utilities.js";

export function detectPriceDirection(prices, minPercent, percentBetween = 0, mountains = 0) {
  let price = null;
  let currentPrice = null;
  let up = 0;
  let down = 0;
  let uptrendCount = 0;
  let downtrendCount = 0;
  let previousPrice = "";

  for (let i = prices.length - 1; i >= 0; i--) {
    if (!currentPrice) currentPrice = prices[i];
    if (!price) price = prices[i];

    const percentDifference = calcPercentageDifference(prices[i - 1], currentPrice);

    if (percentBetween && !(percentDifference < -percentBetween || percentDifference > percentBetween)) {
      continue;
    }

    if (percentDifference > 0) {
      if (previousPrice == "low") downtrendCount++; // Detected low
      previousPrice = "high";
      up += percentDifference;
    } else if (percentDifference < 0) {
      if (previousPrice == "high") uptrendCount++; // Detected high
      previousPrice = "low";
      down += -percentDifference;
    }

    currentPrice = prices[i];
  }
  const changePercent = up - down;
  if (changePercent >= minPercent && uptrendCount >= mountains) return "uptrend";
  else if (changePercent <= -minPercent && downtrendCount >= mountains) return "downtrend";
  else return "unknown";
}

export function detectPriceShape(prices, percentage) {
  const result = { shape: "unknown", value: null, index: null };
  let direction = "";

  let current = prices[prices.length - 1];
  for (let i = prices.length - 1; i >= 0; i--) {
    const change = calcPercentageDifference(prices[i], current);
    if (change > 0) {
      if (change >= percentage && !direction.includes("down")) direction += !direction ? "down:" : "down";
      else if (direction.includes("down")) {
        current = prices[i];
        result.value = current;
        result.index = i;
      }
    } else if (change < 0) {
      if (change <= -percentage && !direction.includes("up")) direction += !direction ? "up:" : "up";
      else if (direction.includes("up")) {
        current = prices[i];
        result.value = current;
        result.index = i;
      }
    }

    if (direction == "up:down") result.shape = "A";
    if (direction == "down:up") result.shape = "V";
    if (result.shape != "unknown") return result;
  }

  if (result.shape) return result;
}

export function findHighestLowestPrice(prices, currentPrice) {
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

// export function getDynamicTakeProfitPct(prices) {
//   const changes = [];
//   for (let i = 1; i < prices.length; i++) {
//     const change = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]);
//     changes.push(change);
//   }

//   const avgChange = changes.reduce((sum, c) => sum + c, 0) / changes.length;
//   return avgChange * 2;
// }

// This calculates the earnings from an investment given the current price, previous price, and invested amount.
export function calcInvestmentProfit(previousPrice, currentPrice, investedAmount) {
  const earningsIncludedProfit = (investedAmount / previousPrice) * currentPrice;
  return +(earningsIncludedProfit - investedAmount).toFixed(8); // Return the Profit;
}

// This calculates the profit from a transaction given the current price, order price, and volume of cryptoCur.
export function calcTransactionProfit(previousPrice, currentPrice, assetVolume, feePercentage) {
  const cost = previousPrice * assetVolume + calculateFee(previousPrice * assetVolume, feePercentage);
  const revenue = currentPrice * assetVolume - calculateFee(currentPrice * assetVolume, feePercentage);
  return revenue - cost; // profit
}

// Methods for testing only:
export function adjustPrice(price, percentage) {
  // This increases the tradePrice 0.10% by multiply it by 1.001, And decreases the tradePrice 0.10%, by multiply it by 0.999
  const multiplier = percentage / 100;
  return [price, price * (1 + multiplier), price * (1 - multiplier)];
}

// Or Look for "historicalVolatility" function in the code;
// Or Look for "calculateVolatility" function in the code;
export function calculatePercentVolatility(prices) {
  // 2 days of 5-min candles = 576 candles (24hrs*2days*12candles/hr)

  // Calculate percentage changes between consecutive candles
  const percentChanges = [];
  for (let i = 1; i < prices.length; i++) {
    const change = (prices[i] - prices[i - 1]) / prices[i - 1];
    percentChanges.push(Math.abs(change)); // Use absolute values for volatility
  }

  // Calculate metrics
  const sum = percentChanges.reduce((a, b) => a + b, 0);
  const avgPercentChange = sum / percentChanges.length;

  // Standard deviation of percentage changes
  const squaredDiffs = percentChanges.map((p) => Math.pow(p - avgPercentChange, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / percentChanges.length;
  const stdDev = Math.sqrt(variance);

  return {
    averagePercentVolatility: avgPercentChange,
    stdDevPercentVolatility: stdDev,
    totalPercentMovement: sum,
    // Optional: volatility ratio (stdDev/avg)
    volatilityRatio: stdDev / avgPercentChange,
  };
}
