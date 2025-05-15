// Linear Regression Analysis method is used to analyze a series of price data for a cryptocurrency or other asset to determine the trend direction. is generally more suited for long-term trading.

import { calcPercentageDifference }from "./services.js";

export function isGoodTimeToBuy(now = new Date(), volatility = "normal") {
  const utcHour = now.getUTCHours();
  const day = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const date = now.getUTCDate();
  const month = now.getUTCMonth(); // 0 = January
  let score = 0;

  // 1. Day-based signals
  if (day === 1) score += 2; // Monday morning
  if (day === 0 && utcHour >= 22) score += 1; // Sunday night

  // 2. Time-based signals
  if (utcHour >= 0 && utcHour <= 1) score += 1; // New York close (daily reset)
  if (utcHour >= 13 && utcHour <= 16) score += 1; // US market open

  // 3. Monthly/Quarterly re-entry signals
  if (date === 1) score += 2; // Start of month
  const quarterlyMonths = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec
  if (quarterlyMonths.includes(month) && date >= 29) score += 1;

  // 4. Volatility check (optional)
  if (volatility === "high") score += 1; // if there's a sudden dip, consider rebound

  return { isBuyTime: score >= 3, score };
}

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
  if (changePercent >= minPercent && uptrendCount >= mountains) return "UPTREND";
  else if (changePercent <= -minPercent && downtrendCount >= mountains) return "DOWNTREND";
  else return "UNKNOWN";
}

export function detectPriceShape(prices, percentage) {
  const result = { shape: "unknown", value: null };
  const currentPrice = prices[prices.length - 1];

  for (let i = prices.length - 1; i >= 0; i--) {
    const price = prices[i];
    const down = calcPercentageDifference(price, currentPrice) >= percentage;
    const up = calcPercentageDifference(price, currentPrice) <= -percentage;

    if (!result.value && (up || down)) result.value = price;
    else if (result.value) {
      const changePercent = calcPercentageDifference(price, result.value);
      if (changePercent <= -percentage) {
        result.shape = "V";
        return result;
      } else if (changePercent >= percentage) {
        result.shape = "A";
        return result;
      }
    }
  }
  return result;

  // const third = parseInt(prices.length / 3);

  // if (prices.length < 3) return null; // Not enough points for a shape

  // const inTheMiddle = (index) => index >= third - 1 && index <= third * 2 - 1;

  // const minPrice = (result.value = Math.min(...prices));
  // const VShape =
  //   calcPercentageDifference(prices[0], minPrice) <= -percentage &&
  //   calcPercentageDifference(minPrice, lastPrices) >= percentage;
  // result.shape = "V"; // Check for "V" shape

  // if (inTheMiddle(prices.indexOf(minPrice)) && VShape) return result;

  // const maxPrice = (result.value = Math.max(...prices));
  // const AShape =
  //   calcPercentageDifference(prices[0], maxPrice) >= percentage &&
  //   calcPercentageDifference(maxPrice, lastPrices) <= -percentage;
  // result.shape = "A"; // Check for "A" shape
  // if (inTheMiddle(prices.indexOf(maxPrice)) && AShape) return result;

  // return result; // No clear "V" or "A" shape
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

export // function getDynamicTakeProfitPct(prices) {
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
  return { tradePrice: price, askPrice: price * (1 + multiplier), bidPrice: price * (1 - multiplier) };
}

