function findSupportResistance(data, lookback = 20) {
  const highs = data.slice(-lookback).map((d) => d.high);
  const lows = data.slice(-lookback).map((d) => d.low);
  return {
    support: Math.min(...lows),
    resistance: Math.max(...highs),
  };
}

function filterRecentTrendlines(pivots, maxAge = 30, dataLength) {
  return pivots.filter((pivot) => pivot.index >= dataLength - maxAge);
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

function calcAveragePrice(prices) {
  if (prices.length === 0) throw new Error("Price list cannot be empty.");
  const total = prices.reduce((sum, price) => sum + price, 0);
  return +(total / prices.length).toFixed(8);
}
function calcPercentageDifference(oldPrice, newPrice) {
  const difference = newPrice - oldPrice;
  return +(newPrice > oldPrice ? (100 * difference) / newPrice : (difference / oldPrice) * 100).toFixed(2);
}
function calculateFee(amount, feePercentage) {
  return !feePercentage ? 0 : (amount * feePercentage) / 100;
}
function smoothPricesAndUpdate(prices, range = 3) {
  // This remove noises from prices using a moving average
  if (range < 1 || range > prices.length) return prices;

  const result = [];
  for (let i = 0; i < prices.length; i += range) {
    const slice = prices.slice(i, Math.max(i, i + range));
    if (!slice[0].tradePrice) result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    else {
      result.push({
        tradePrice: slice.reduce((a, b) => a + b.tradePrice, 0) / slice.length,
        askPrice: slice.reduce((a, b) => a + b.askPrice, 0) / slice.length,
        bidPrice: slice.reduce((a, b) => a + b.bidPrice, 0) / slice.length,
      });
    }
  }

  return result;
}
function smoothPrices(prices, round = 1) {
  for (let i = 0; i < round; i++) {
    prices = prices.map((_, i, arr) => {
      const slice = arr.slice(Math.max(0, i - 2), i + 1);

      if (!slice[0].tradePrice) return slice.reduce((a, b) => a + b, 0) / slice.length;
      else {
        return {
          tradePrice: slice.reduce((a, b) => a + b.tradePrice, 0) / slice.length,
          askPrice: slice.reduce((a, b) => a + b.askPrice, 0) / slice.length,
          bidPrice: slice.reduce((a, b) => a + b.bidPrice, 0) / slice.length,
        };
      }
    });
  }

  return prices;
}

// function analyzePrices(prices) {
//   const result = { lows: [], highs: [], negativesPercent: 0, positivesPercent: 0, startedWith: "" };

//   for (let i = 0; i < prices.length - 1; i++) {
//     const previous = prices[i - 1] || prices[i];
//     const current = prices[i];
//     const next = prices[i + 1] || prices[i];

//     const percentDifference = calcPercentageDifference(current, next);
//     if (percentDifference < 0) result.negativesPercent += percentDifference;
//     if (percentDifference > 0) result.positivesPercent += percentDifference;

//     if (previous > current && current < next) {
//       if (!result.highs[0] && !result.lows[0]) result.startedWith = "low";
//       result.lows.push(prices[i]);
//     } else if (current > previous && current > next) {
//       if (!result.highs[0] && !result.lows[0]) result.startedWith = "high";
//       result.highs.push(prices[i]);
//     }
//   }

//   const changes = Math.min(result.lows.length, result.highs.length);
//   result.profitPercent = result.positivesPercent / changes;
//   result.lossPercent = result.negativesPercent / changes;
//   return result;
// }

module.exports = {
  findSupportResistance,
  filterRecentTrendlines,
  hasStrongSlope,
  calcAveragePrice,
  calcPercentageDifference,
  calculateFee,
  smoothPricesAndUpdate,
  smoothPrices,
};
