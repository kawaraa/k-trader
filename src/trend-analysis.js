// Linear Regression Analysis method is used to analyze a series of price data for a cryptocurrency or other asset to determine the trend direction. is generally more suited for long-term trading.

const { calcPercentageDifference } = require("./services");

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

function detectPriceDirection(prices, minPercent, percentBetween = 0, mountains = 0) {
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

function detectBreakoutOrBreakdown(prices, sensitivity = 0.5) {
  /* Suggested minimums:
Interval	| Recommended History
5m        | Last 2–3 hours (24–36 candles)
15m       | Last 6–8 hours (24–32 candles)
1h        | Last 2–4 days (48–96 candles)
1d        | Last 2–4 weeks (15–30 candles)
*/

  if (prices.length < 20) throw new Error("detectBreakoutOrBreakdown: Not enough data");

  const window = 5; // number of candles to confirm swing highs/lows
  const highs = [];
  const lows = [];

  for (let i = window; i < prices.length - window; i++) {
    const slice = prices.slice(i - window, i + window + 1);
    const mid = prices[i];

    const isHigh = slice.every((p) => mid >= p);
    const isLow = slice.every((p) => mid <= p);

    if (isHigh) highs.push({ i, price: mid });
    if (isLow) lows.push({ i, price: mid });
  }

  // Early exit if not enough swings
  if (highs.length < 2 && lows.length < 2) return "No strong pattern detected";

  // Check rising lows
  let risingLows = 0;
  for (let i = 1; i < lows.length; i++) {
    if (lows[i].price > lows[i - 1].price) risingLows++;
  }

  // Check falling highs
  let fallingHighs = 0;
  for (let i = 1; i < highs.length; i++) {
    if (highs[i].price < highs[i - 1].price) fallingHighs++;
  }

  const recentHigh = highs[highs.length - 1]?.price || 0;
  const recentLow = lows[lows.length - 1]?.price || Infinity;
  const latestPrice = prices[prices.length - 1];

  const breakout = ((latestPrice - recentHigh) / recentHigh) * 100 >= sensitivity;
  const breakdown = ((recentLow - latestPrice) / recentLow) * 100 >= sensitivity;

  if (risingLows >= 2 && breakout) {
    return "Likely breakout (rise)";
  } else if (fallingHighs >= 2 && breakdown) {
    return "Likely breakdown (drop)";
  } else if (risingLows >= 2) {
    return "Potential breakout forming";
  } else if (fallingHighs >= 2) {
    return "Potential breakdown forming";
  } else {
    return "No strong pattern detected";
  }
}

function detectPriceShape(prices, percentage) {
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

function isGoodTimeToBuy({ now = new Date(), volatility = "normal" } = {}) {
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

function findHighestLowestPrice(prices, currentPrice) {
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

function getDynamicTakeProfitPct(prices) {
  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    const change = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]);
    changes.push(change);
  }

  const avgChange = changes.reduce((sum, c) => sum + c, 0) / changes.length;
  return avgChange * 2;
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

function isOlderThen(timestamp, hours) {
  return (Date.now() - new Date(timestamp || Date.now()).getTime()) / 60000 / 60 > hours;
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
  simpleMovingAverage,
  detectPriceDirection,
  detectBreakoutOrBreakdown,
  isGoodTimeToBuy,
  findHighestLowestPrice,
  getDynamicTakeProfitPct,
  detectPriceShape,
  calcInvestmentProfit,
  calcTransactionProfit,
  adjustPrice,
  isOlderThen,
  countPriceChanges,
};
