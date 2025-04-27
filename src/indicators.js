const { calcPercentageDifference, calcAveragePrice } = require("./services");

/* ========== trend analysis Indicators ========== */

// const { RSI } = require("technicalindicators");
// function calculateRSI(closes, period = 14) {
//   return RSI.calculate({ values: closes, period });
// }

// Relative Strength Index (RSI) method is designed to compute the (RSI), which is a momentum oscillator used to measure the speed and change of price movements. It ranges from 0 to 100 and is used to identify overbought or oversold conditions.
// - When RSI rise means the market is moving upward, and prices are likely to keep rising. It indicates strong buying interest and positive market sentiment.
// - When the RSI is very low, suggesting that the asset is likely in oversold conditions, which could indicate a potential buying opportunity if the price stabilizes.

// calcRelativeStrengthIndex
function calculateRSI(prices, period = 14) {
  // The 14-period setting for the RSI was recommended by J. Welles Wilder, the developer of the RSI, in his book "New Concepts in Technical Trading Systems." This default period is widely used because it has been found to provide a good balance between responsiveness and reliability in identifying overbought and oversold conditions across various markets.

  if (prices.length < period) throw new Error("Not enough data to calculate RSI.");

  let gains = 0;
  let losses = 0;

  // Calculate initial gains and losses for the first `period` prices
  for (let i = 1; i < period; i++) {
    const difference = prices[i] - prices[i - 1];
    if (difference > 0) {
      gains += difference;
    } else {
      losses -= difference; // Absolute value of the loss
    }
  }

  // Initial average gain and loss
  let averageGain = gains / period;
  let averageLoss = losses / period;

  // Store the final RSI
  let rsi = 0;

  // Now calculate RSI for each subsequent price
  for (let i = period; i < prices.length; i++) {
    const difference = prices[i] - prices[i - 1];
    const gain = difference > 0 ? difference : 0;
    const loss = difference < 0 ? -difference : 0;

    // Apply exponential smoothing to the average gain and loss
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;

    // Calculate relative strength (RS)
    const rs = averageLoss === 0 ? 100 : averageGain / averageLoss;

    // Calculate RSI using the relative strength (RS)
    rsi = 100 - 100 / (1 + rs);
  }

  // if (rsi > 70) return "sell"; // Consider selling if the RSI indicates overbought conditions
  // else if (rsi < 30) return "buy"; // Consider buying if the RSI indicates oversold conditions
  // return "hold"; // No clear signal; hold the position or wait for better conditions

  return +rsi.toFixed(2); // Return RSI value rounded to two decimal places

  // - The 30 to 70 range for RSI is commonly used because:
  // 1. RSI above 70: Often indicates the asset is overbought and might be due for a pullback.
  // 2. RSI below 30: Typically signals that the asset is oversold and might be due for a rebound.
}

function detectTrend(data, baseFlatThreshold = 0.003) {
  if (!data || data.length < 2) return "sideways";

  const n = data.length - 1;
  const lows = data.map((d) => d.low);
  const highs = data.map((d) => d.high);

  const lowSlope = (lows.at(-1) - lows[0]) / n;
  const highSlope = (highs.at(-1) - highs[0]) / n;

  const volatility = Math.max(...highs) - Math.min(...lows);
  const dynamicFlatThreshold = volatility < 0.01 ? baseFlatThreshold : baseFlatThreshold / 2;

  if (Math.abs(lowSlope) < dynamicFlatThreshold && Math.abs(highSlope) < dynamicFlatThreshold) {
    return "sideways";
  }
  if (lowSlope > 0 && highSlope > 0) return "uptrend";
  if (lowSlope < 0 && highSlope < 0) return "downtrend";

  return "sideways";
}

function computeDynamicThreshold(prices) {
  if (prices.length < 2) return 0.0001;

  const deltas = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push(prices[i] - prices[i - 1]);
  }
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((sum, val) => sum + (val - mean) ** 2, 0) / deltas.length;
  const stdDev = Math.sqrt(variance);

  // Coefficient of Variation (CV)
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const cv = stdDev / avgPrice;

  // Dynamic multiplier: lower for low CV, higher for high CV
  const multiplier = Math.min(Math.max(cv * 2, 0.01), 0.1); // clamps between 0.01 and 0.1

  return stdDev * multiplier;
}

function linearRegression(prices, returnString, threshold = 0) {
  if (prices.length < 2) return "sideways";
  threshold = threshold < 1 ? threshold : computeDynamicThreshold(prices); // 0.0001 works best for me

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

  // Flat slope check: If slope is very small, consider as sideways
  // const flatThreshold = 0.0001; // Tolerance for very small slopes
  // if (Math.abs(slope) < flatThreshold) return "sideways";

  if (!returnString) return slope;
  if (slope > threshold) return "uptrend";
  if (slope < -threshold) return "downtrend";
  return "sideways";

  // If the slope is positive, it indicates an upward trend, which typically suggests buying in anticipation of further gains. Conversely, if the slope is negative, it indicates a downward trend, suggesting selling to avoid further losses.
  // 1. Positive Slope: Indicates an upward trend, which could be a signal to buy.
  // 2. Negative Slope: Indicates a downward trend, which could be a signal to sell.
}

function hasStrongSlope(points, type = "high", threshold = 0.05) {
  /* ====> threshold <====
    0.05 (default) → Good for general fast-moving markets
    Higher (e.g. 0.1) → Only consider steep slopes (fewer but stronger signals)
    Lower (e.g. 0.02) → Accept flatter trendlines (more signals, but riskier) 
  */
  if (points.length < 2) return false;
  const values = points.map((d) => d[type]);
  const slope = linearRegression(values);
  return Math.abs(slope) > threshold;
}

function detectTrendlines(data) {
  const pivots = { support: [], resistance: [] };

  for (let i = 2; i < data.length - 2; i++) {
    const isSupport =
      data[i].low < data[i - 1].low &&
      data[i].low < data[i - 2].low &&
      data[i].low < data[i + 1].low &&
      data[i].low < data[i + 2].low;

    const isResistance =
      data[i].high > data[i - 1].high &&
      data[i].high > data[i - 2].high &&
      data[i].high > data[i + 1].high &&
      data[i].high > data[i + 2].high;

    if (isSupport) pivots.support.push({ ...data[i], index: i });
    if (isResistance) pivots.resistance.push({ ...data[i], index: i });
  }

  return pivots;
}

function isVolumeRising(data) {
  if (!data || data.length < 1) return false;
  const vols = data.map((d) => d.volume);
  for (let i = 1; i < vols.length; i++) {
    if (vols[i] < vols[i - 1]) return false; // if any volume drops, not rising
  }
  return true;
}
/*
===== My implementations ===== 
*/
function findPriceMovement(prices, minPercent, dropRisePercent) {
  const length = prices.length - 1;
  let price = prices.at(-1);
  let movements = 0;
  let result = "stable";

  for (let i = length; i > -1; i--) {
    const changePercent = calcPercentageDifference(prices[i], price);

    if (result.includes("increasing")) {
      if (!dropRisePercent || changePercent <= -dropRisePercent) return result;
    } else if (result.includes("dropping")) {
      if (!dropRisePercent || changePercent >= dropRisePercent) return result;
    } else {
      movements++;
      if (changePercent >= minPercent) {
        result = `increasing:${movements}`;
        price = prices[i];
      } else if (changePercent <= -minPercent) {
        result = `dropping:${movements}`;
        price = prices[i];
      }
    }
  }

  if (!dropRisePercent || /LOW|HIGH/gim.test(result)) return result;

  return "STABLE";
}
function analyzeTrend(prices, weakness = 0.5) {
  const highs = [0];
  const lows = [0];
  let accumulator = 0;

  if (prices.length < 2) return { highs, lows, trend: null };

  for (let i = 0; i < prices.length; i++) {
    accumulator += calcPercentageDifference(prices[i], prices[i + 1]);

    if (accumulator > 0 && accumulator > Math.max(0, highs.at(-1) - 0.25))
      highs[highs.length - 1] = accumulator;
    else {
      const negativePercent = accumulator - highs.at(-1);
      if (accumulator >= 0 && negativePercent <= -0.5) {
        accumulator = negativePercent;
        if (lows.at(-1) == 0) lows[lows.length - 1] = negativePercent;
        else lows.push(negativePercent);
      }
    }

    if (accumulator < 0 && accumulator < Math.min(0, lows.at(-1) + 0.25)) lows[lows.length - 1] = accumulator;
    else {
      const positivePercent = accumulator - lows.at(-1);
      if (accumulator <= 0 && positivePercent >= 0.5) {
        accumulator = positivePercent;
        if (highs.at(-1) == 0) highs[highs.length - 1] = positivePercent;
        else highs.push(positivePercent);
      }
    }
  }

  const increased = highs.reduce((t, it) => t + it, 0);
  const dropped = Math.abs(lows.reduce((t, it) => t + it, 0));
  return {
    highs,
    lows,
    increased,
    dropped,
    trend:
      increased > dropped + weakness ? "UPTREND" : dropped > increased + weakness ? "DOWNTREND" : "SIDEWAYS",
  };
}
// function analyzeTrend(prices) {
//   let isDowntrend = false;
//   let highCount = 0;
//   let averageHighsPercentage = 0;
//   let highPercentTotal = 0;

//   if (prices.length < 2) return { isDowntrend, highCount, averageHighsPercentage };

//   for (let i = 1; i < prices.length; i++) {
//     const change = prices[i] - prices[i - 1];
//     if (change > 0) {
//       const percent = (change / prices[i - 1]) * 100;
//       highPercentTotal += percent;
//       highCount++;
//     }
//   }

//   averageHighsPercentage = highCount ? +(highPercentTotal / highCount).toFixed(2) : 0;
//   isDowntrend = prices[prices.length - 1] < prices[0];

//   return { isDowntrend, highCount, averageHighsPercentage };
// }

// function runeTradingTest(prices, range = 18) {
//   const calculateLimits = (percent) => ({
//     dropPercent: percent * 1.2,
//     buySellOnPercent: percent / 5,
//     profitPercent: percent,
//     stopLossPercent: percent,
//   });

//   let percentage = 2;
//   const maxPercentage = 20;
//   const result = {
//     netProfit: 0,
//     profit: 0,
//     loss: 0,
//     ...calculateLimits(maxPercentage),
//     trades: 0,
//   };

//   while (percentage <= maxPercentage) {
//     let prevProfit = 0;
//     let loss = 0;
//     let profit = 0;
//     let pricePointer = null;
//     let trades = 0;
//     const { dropPercent, buySellOnPercent, profitPercent, stopLossPercent } = calculateLimits(percentage);
//     let lastTradeAge = 0;

//     for (let i = range; i < prices.length; i++) {
//       const newPrices = prices.slice(i - range, i);
//       const bidPrices = newPrices.map((p) => p.bidPrice);
//       const price = newPrices.at(-1);
//       const highest = bidPrices.toSorted((a, b) => a - b).at(-1);
//       const dropped = calcPercentageDifference(highest, price.askPrice) < -dropPercent;
//       const increasing = findPriceMovement(bidPrices, buySellOnPercent).includes("INCREASING");

//       const askBidSpreadPercentage = calcPercentageDifference(price.bidPrice, price.askPrice);
//       const averageAskBidSpread = calcAveragePrice(
//         newPrices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
//       );
//       const safeAskBidSpread = askBidSpreadPercentage <= averageAskBidSpread;

//       lastTradeAge++;
//       if (lastTradeAge < range) continue;

//       if (!pricePointer && safeAskBidSpread && dropped && increasing) pricePointer = price.askPrice;
//       else if (pricePointer && safeAskBidSpread) {
//         const priceChange = calcPercentageDifference(pricePointer, price.bidPrice);

//         if (priceChange > prevProfit) prevProfit = priceChange;

//         if (prevProfit > profitPercent && prevProfit - priceChange >= buySellOnPercent) {
//           profit += priceChange;
//           trades++;
//           pricePointer = null;
//           prevProfit = 0;
//         } else if (priceChange <= -Math.max(stopLossPercent, 10)) {
//           loss += priceChange;
//           trades++;
//           pricePointer = null;
//           prevProfit = 0;
//         }
//       }
//     }

//     if (profit + loss > result.profit + result.loss) {
//       result.profit = +profit.toFixed(2);
//       result.loss = +loss.toFixed(2);
//       result.netProfit = result.profit + result.loss;
//       result.dropPercent = dropPercent;
//       result.buySellOnPercent = buySellOnPercent;
//       result.profitPercent = profitPercent;
//       result.stopLossPercent = stopLossPercent;
//       result.trades = trades;
//     }

//     percentage++;
//   }
//   return result;
// }

/*
===== Pattern detection Methods ===== 
*/
function detectCandlestickPattern(data) {
  if (data.length < 3) return "none"; // Ensure there is enough data for complex patterns

  const last = data.at(-1);
  const prev = data.at(-2);
  const prevPrev = data.at(-3);

  const bodySize = Math.abs(last.close - last.open);
  const upperWick = last.high - Math.max(last.close, last.open);
  const lowerWick = Math.min(last.close, last.open) - last.low;

  // Basic patterns
  const isBullishEngulfing =
    prev.close < prev.open && last.close > last.open && last.close > prev.open && last.open < prev.close;

  const isBearishEngulfing =
    prev.close > prev.open && last.close < last.open && last.open > prev.close && last.close < prev.open;

  const isHammer = lowerWick > bodySize * 2 && upperWick < bodySize;
  const isInvertedHammer = upperWick > bodySize * 2 && lowerWick < bodySize;

  const isShootingStar = isInvertedHammer && last.close < last.open;
  const isDoji = bodySize < (last.high - last.low) * 0.1;

  const isPiercing =
    prev.close < prev.open &&
    last.open < prev.low &&
    last.close > (prev.open + prev.close) / 2 &&
    last.close < prev.open;

  const isDarkCloudCover =
    prev.close > prev.open &&
    last.open > prev.high &&
    last.close < (prev.open + prev.close) / 2 &&
    last.close > prev.open;

  // Advanced patterns (Morning Star & Evening Star)
  const isMorningStar =
    last.open < prev.close &&
    last.close > prevPrev.close &&
    prev.open > prev.close &&
    prevPrev.open > prevPrev.close &&
    Math.abs(last.close - prevPrev.open) > Math.abs(prev.close - prevPrev.open) &&
    Math.abs(prev.close - prev.open) < 0.2 * (prevPrev.high - prevPrev.low);

  const isEveningStar =
    last.open > prev.close &&
    last.close < prevPrev.close &&
    prev.open < prev.close &&
    prevPrev.open < prevPrev.close &&
    Math.abs(last.open - prevPrev.close) > Math.abs(prev.open - prevPrev.close) &&
    Math.abs(prev.close - prev.open) < 0.2 * (prevPrev.high - prevPrev.low);

  // Advanced Pattern;
  if (isMorningStar) return "morning-star";
  if (isEveningStar) return "evening-star";

  // Basic pattern
  if (isBullishEngulfing) return "bullish-engulfing";
  if (isBearishEngulfing) return "bearish-engulfing";
  if (isHammer) return "hammer";
  if (isInvertedHammer) return "inverted-hammer";
  if (isPiercing) return "piercing";
  if (isDarkCloudCover) return "dark-cloud-cover";
  if (isShootingStar) return "shooting-star";
  if (isDoji) return "doji";

  return "none";

  // 1. Bullish Patterns (Signal possible price up moves)
  // Bullish Engulfing: Small red candle followed by a bigger green candle that engulfs the red body. Strong reversal up.
  // Hammer: Small body at top, long lower wick. Reversal up after a downtrend (buyers pushed price back up).
  // Inverted Hammer: Small body at bottom, long upper wick. Reversal up, but weaker than regular hammer.
  // Piercing Pattern: Red candle then a green candle that opens lower but closes above 50% of the red body. Reversal up — buyers are fighting back.
  // Morning Star: 3-candle pattern, Big red, Small-bodied candle (indecision) and Big green candle. Strong reversal up.
  // Doji: Open Close price, very small body. Indecision, often seen before reversals.

  // 2. Bearish Patterns (Signal possible price down moves)
  // Bearish Engulfing: Small green candle then a big red candle that engulfs it. Strong reversal down.
  // Shooting Star: Small body at bottom, long upper wick. Reversal down after an uptrend.
  // Dark Cloud Cover: Green candle then a red candle that opens higher but closes below 50% of green body. Reversal down — sellers are stepping in.
  // Evening Star: 3-candle pattern, Big green, Small-bodied candle (indecision) and Big red candle. Strong reversal down signal.
}

function detectVolumeDivergence(candles) {
  if (candles.length < 1) return null;
  const first = candles[0];
  const last = candles.at(-1);

  const priceDirection = last.close > first.close ? "up" : "down";
  const volumeSumFirstHalf = candles
    .slice(0, Math.floor(candles.length / 2))
    .reduce((sum, c) => sum + c.volume, 0);
  const volumeSumSecondHalf = candles
    .slice(Math.floor(candles.length / 2))
    .reduce((sum, c) => sum + c.volume, 0);
  const volumeDirection = volumeSumSecondHalf > volumeSumFirstHalf ? "up" : "down";

  if (priceDirection === "up" && volumeDirection === "down") return "weak-uptrend";
  if (priceDirection === "down" && volumeDirection === "down") return "weak-downtrend";

  return "healthy";
}

function detectVolumeSpike(candles, threshold = 3) {
  if (candles.length < 2) return false; // Can't detect with less than 2 candles

  // Calculate the average volume of the last N candles (let's use 5 as default)
  const recentVolumes = candles.slice(-6).map((candle) => candle.volume);
  const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;

  // Check if the latest volume is much higher than the average (e.g. 3x or more)
  const lastVolume = candles.at(-1).volume;

  if (lastVolume > avgVolume * threshold) {
    console.log(`Volume spike detected: Last Volume: ${lastVolume}, Avg Volume: ${avgVolume}`);
    return true; // Volume spike detected
  }

  return false; // No significant spike
}

module.exports = {
  calculateRSI,
  detectTrend,
  linearRegression,
  hasStrongSlope,
  detectTrendlines,
  isVolumeRising,
  findPriceMovement,
  // analyzeTrend,
  analyzeTrend,

  detectCandlestickPattern,
  detectVolumeDivergence,
};
