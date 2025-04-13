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

  return rsi.toFixed(2); // Return RSI value rounded to two decimal places

  // - The 30 to 70 range for RSI is commonly used because:
  // 1. RSI above 70: Often indicates the asset is overbought and might be due for a pullback.
  // 2. RSI below 30: Typically signals that the asset is oversold and might be due for a rebound.
}

function detectTrend(data, lookback = 5) {
  const lows = data.slice(-lookback).map((d) => d.low);
  const highs = data.slice(-lookback).map((d) => d.high);
  const lowSlope = lows.at(-1) - lows[0];
  const highSlope = highs.at(-1) - highs[0];

  if (lowSlope > 0 && highSlope > 0) return "uptrend";
  if (lowSlope < 0 && highSlope < 0) return "downtrend";
  return "sideways";
}

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
  // return slope > 0 ? "buy" : "sell";
  return slope;

  // If the slope is positive, it indicates an upward trend, which typically suggests buying in anticipation of further gains. Conversely, if the slope is negative, it indicates a downward trend, suggesting selling to avoid further losses.
  // 1. Positive Slope: Indicates an upward trend, which could be a signal to buy.
  // 2. Negative Slope: Indicates a downward trend, which could be a signal to sell.
}

function detectTrendlines(data, lookback = 20) {
  const pivots = { support: [], resistance: [] };
  const slice = data.slice(-lookback);

  for (let i = 2; i < slice.length - 2; i++) {
    const isSupport =
      slice[i].low < slice[i - 1].low &&
      slice[i].low < slice[i - 2].low &&
      slice[i].low < slice[i + 1].low &&
      slice[i].low < slice[i + 2].low;

    const isResistance =
      slice[i].high > slice[i - 1].high &&
      slice[i].high > slice[i - 2].high &&
      slice[i].high > slice[i + 1].high &&
      slice[i].high > slice[i + 2].high;

    if (isSupport) pivots.support.push(slice[i]);
    if (isResistance) pivots.resistance.push(slice[i]);
  }

  return pivots;
}

/*
===== My implementations ===== 
*/
function findPriceMovement(prices, minPercent, dropRisePercent) {
  const length = prices.length - 1;
  let price = prices.at(-1);
  let movements = 0;
  let result = "STABLE";

  for (let i = length; i > -1; i--) {
    const changePercent = calcPercentageDifference(prices[i], price);

    if (result.includes("INCREASING")) {
      if (!dropRisePercent || changePercent <= -dropRisePercent) return result;
    } else if (result.includes("DROPPING")) {
      if (!dropRisePercent || changePercent >= dropRisePercent) return result;
    } else {
      movements++;
      if (changePercent >= minPercent) {
        result = `INCREASING:${movements}`;
        price = prices[i];
      } else if (changePercent <= -minPercent) {
        result = `DROPPING:${movements}`;
        price = prices[i];
      }
    }
  }

  if (!dropRisePercent || /LOW|HIGH/gim.test(result)) return result;

  return "STABLE";
}

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
function detectBasicPattern(data) {
  const last = data.at(-1);
  const prev = data.at(-2);

  const bullishEngulfing =
    prev.close < prev.open && last.close > last.open && last.open < prev.close && last.close > prev.open;

  const bearishEngulfing =
    prev.close > prev.open && last.close < last.open && last.open > prev.close && last.close < prev.open;

  const body = Math.abs(last.close - last.open);
  const hammer =
    body < (last.high - last.low) * 0.3 &&
    (last.open - last.low > body * 2 || last.close - last.low > body * 2);

  const shootingStar =
    body < (last.high - last.low) * 0.3 &&
    (last.high - last.open > body * 2 || last.high - last.close > body * 2);

  if (bullishEngulfing) return "bullish-engulfing";
  if (bearishEngulfing) return "bearish-engulfing";
  if (hammer && last.close > last.open) return "hammer";
  if (shootingStar && last.open > last.close) return "shooting-star";

  return null;
}

function detectAdvancedPattern(data) {
  if (data.length < 3) throw new Error("detectAdvancedPattern: No enough data");
  const last = data.at(-1);
  const prev = data.at(-2);
  const prevPrev = data.at(-3);

  // Check for Morning Star (Bullish Reversal)
  const isMorningStar =
    last.close > prevPrev.close &&
    last.open < prev.close &&
    last.close > prevPrev.close &&
    prev.open > prev.close &&
    prevPrev.open > prevPrev.close &&
    Math.abs(last.close - prevPrev.open) > Math.abs(prev.close - prevPrev.open);

  // Check for Evening Star (Bearish Reversal)
  const isEveningStar =
    last.close < prevPrev.close &&
    last.open > prev.close &&
    last.close < prevPrev.close &&
    prev.open < prev.close &&
    prevPrev.open < prevPrev.close &&
    Math.abs(last.open - prevPrev.close) > Math.abs(prev.open - prevPrev.close);

  if (isMorningStar) return "morning-star";
  if (isEveningStar) return "evening-star";
  return null;
}

module.exports = {
  calculateRSI,
  detectTrend,
  linearRegression,
  detectTrendlines,

  findPriceMovement,
  // runeTradingTest,

  detectBasicPattern,
  detectAdvancedPattern,
};
