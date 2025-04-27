function findSupportResistance(data) {
  if (!data || data.length < 3) return { support: null, resistance: null };

  const highs = data.map((d) => d.high);
  const lows = data.map((d) => d.low);
  return {
    support: Math.min(...lows),
    resistance: Math.max(...highs),
  };
}

function filterRecentTrendlines(pivots, dataLength, maxAge = 30) {
  return pivots.filter((pivot) => pivot.index >= dataLength - maxAge);
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
function removeLowsOrHighs(prices, window = 12, percentThreshold = -1, round = 1) {
  function smoother(pricesData) {
    let newPrices = [];

    for (let i = 0; i < pricesData.length; i++) {
      const start = i;
      const end = Math.min(pricesData.length, i + window + 1);
      const windowSlice = pricesData.slice(start, end).map((p) => p || p);
      const price1 = windowSlice[0];
      const price2 = windowSlice.at(-1);
      let shouldCombine = false;

      if (percentThreshold > 0) {
        const max = Math.max(...windowSlice);
        const high = calcPercentageDifference(price1, max);
        const low = calcPercentageDifference(max, price2);
        shouldCombine = high >= 0 && high <= percentThreshold && low >= -percentThreshold;
      } else {
        const min = Math.min(...windowSlice);
        const low = calcPercentageDifference(price1, min);
        const high = calcPercentageDifference(min, price2);
        shouldCombine = low <= 0 && low >= percentThreshold && high <= -percentThreshold;
      }

      if (!shouldCombine) newPrices.push(pricesData[i]);
      else {
        newPrices = newPrices.slice(0, i).concat(generateRange(price1, price2, window));
        i = end;
      }
    }

    return newPrices;
  }

  for (let time = 1; time < round; time++) {
    prices = smoother(prices);
  }

  return prices;
}

function normalizePrices(prices, averageAskBidSpread = 0.5) {
  const normalAskBidSpreed = (spreed) => spreed <= Math.min(averageAskBidSpread * 2, 1);
  const normalizedPrices = [];
  for (let i = 0; i < prices.length; i++) {
    const askBidSpreedPercent = calcPercentageDifference(prices[i].bidPrice, prices[i].askPrice);
    if (normalAskBidSpreed(askBidSpreedPercent)) {
      normalizedPrices.push(calcAveragePrice([prices[i].askPrice, prices[i].bidPrice]));
    } else if (normalizedPrices.at(-1)) {
      normalizedPrices.push(normalizedPrices.at(-1));
    }
  }
  return normalizedPrices;
}

function generateRange(start, end, length) {
  if (length < 2) return length === 1 ? [start] : [];
  const step = (end - start) / (length - 1);
  return Array.from({ length }, (_, i) => start + i * step);
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
  calcAveragePrice,
  calcPercentageDifference,
  calculateFee,
  smoothPricesAndUpdate,
  smoothPrices,
  normalizePrices,
  generateRange,
  removeLowsOrHighs,
};
