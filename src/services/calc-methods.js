import { calcAveragePrice, calcPercentageDifference } from "../../shared-code/utilities.js";

export function findSupportResistance(data) {
  if (!data || data.length < 3) return { support: null, resistance: null };

  const highs = data.map((d) => d.high);
  const lows = data.map((d) => d.low);
  return {
    support: Math.min(...lows),
    resistance: Math.max(...highs),
  };
}

export function filterRecentTrendlines(pivots, dataLength, maxAge = 30) {
  return pivots.filter((pivot) => pivot.index >= dataLength - maxAge);
}

export function calculateFee(amount, feePercentage) {
  return !feePercentage ? 0 : (amount * feePercentage) / 100;
}
export function smoothPricesAndUpdate(prices, range = 3) {
  // This remove noises from prices using a moving average
  if (range < 1 || range > prices.length) return prices;

  const result = [];
  for (let i = 0; i < prices.length; i += range) {
    const slice = prices.slice(i, Math.max(i, i + range));
    if (!slice[0][0]) result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    else {
      result.push([
        slice.reduce((a, b) => a[0] + b[0], 0) / slice.length,
        slice.reduce((a, b) => a[1] + b[1], 0) / slice.length,
        slice.reduce((a, b) => a[2] + b[2], 0) / slice.length,
      ]);
    }
  }

  return result;
}
export function smoothPrices(prices, round = 1) {
  for (let i = 0; i < round; i++) {
    prices = prices.map((_, i, arr) => {
      const slice = arr.slice(Math.max(0, i - 2), i + 1);

      if (!slice[0][0]) return slice.reduce((a, b) => a + b, 0) / slice.length;
      else {
        return [
          slice.reduce((a, b) => a[0] + b[0], 0) / slice.length,
          slice.reduce((a, b) => a[1] + b[1], 0) / slice.length,
          slice.reduce((a, b) => a[2] + b[2], 0) / slice.length,
        ];
      }
    });
  }

  return prices;
}
export function removeLowsOrHighs(prices, window = 12, percentThreshold = -1, round = 1) {
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

export function normalizePrices(prices) {
  // return prices.map((p) => calcAveragePrice([p[1], p[2]]));
  if (prices.length < 1) return [];
  const normalizedPrices = [];

  for (let i = 0; i < prices.length; i++) {
    const askBidSpreedPercent = calcPercentageDifference(prices[i][2], prices[i][1]);
    if (askBidSpreedPercent <= 1) {
      normalizedPrices.push(calcAveragePrice([prices[i][1], prices[i][2]]));
    } else if (normalizedPrices.at(-1)) {
      normalizedPrices.push(normalizedPrices.at(-1));
    }
  }
  return normalizedPrices;
}

export function generateRange(start, end, length) {
  if (length < 2) return length === 1 ? [start] : [];
  const step = (end - start) / (length - 1);
  return Array.from({ length }, (_, i) => start + i * step);
}

// This functions is too strict
export function findSupportResistanceUsingClusteringAlg(data, clusterThreshold) {
  if (!data || data.length < 10) return { supports: [], resistances: [] };

  const avgPrice = data.reduce((sum, d) => sum + d.close, 0) / data.length;
  clusterThreshold = clusterThreshold || Math.max(0.005, Math.min(0.02, avgPrice * 0.0005));

  const currentPrice = data[data.length - 1].close;

  // Improved precision calculation for different asset classes
  const precision = currentPrice > 1000 ? 0 : currentPrice > 10 ? 1 : currentPrice > 1 ? 2 : 4;

  // More robust rounding function
  const roundPrice = (price) => {
    const factor = Math.pow(10, precision);
    return Math.round(price * factor) / factor;
  };

  // Enhanced clustering algorithm
  const clusterLevels = (levels, isSupport) => {
    if (levels.length === 0) return [];

    const sorted = [...levels].sort((a, b) => a - b);
    const clusters = [];
    let currentCluster = [];

    // Dynamic threshold based on average price volatility
    const priceChanges = data.slice(-14).map((d) => Math.abs(d.close - d.open));
    const avgVolatility = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const dynamicThreshold = Math.max(avgVolatility * 0.5, currentPrice * clusterThreshold);

    sorted.forEach((price, i) => {
      price = roundPrice(price);

      if (currentCluster.length === 0) {
        currentCluster.push(price);
      } else {
        const lastPrice = currentCluster[currentCluster.length - 1];
        if (Math.abs(price - lastPrice) <= dynamicThreshold) {
          currentCluster.push(price);
        } else {
          clusters.push(currentCluster);
          currentCluster = [price];
        }
      }
    });

    if (currentCluster.length > 0) clusters.push(currentCluster);

    return clusters
      .filter((c) => c.length >= 1) // Reduced minimum cluster size
      .map((c) => {
        const avgPrice = c.reduce((a, b) => a + b, 0) / c.length;
        const touches = data.filter(
          (d) => Math.abs((isSupport ? d.low : d.high) - avgPrice) <= dynamicThreshold
        ).length;

        const recentTouches = data
          .slice(-24)
          .filter((d) => Math.abs((isSupport ? d.low : d.high) - avgPrice) <= dynamicThreshold).length;

        const strength = touches * 0.6 + recentTouches * 0.4;

        return {
          price: roundPrice(avgPrice),
          strength: parseFloat(strength.toFixed(2)),
          touches,
          recentTouches,
        };
      })
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5); // Return top 5 strongest levels
  };

  return {
    supports: clusterLevels(
      data.map((d) => d.low),
      true
    ),
    resistances: clusterLevels(
      data.map((d) => d.high),
      false
    ),
  };
}

// export function analyzePrices(prices) {
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
