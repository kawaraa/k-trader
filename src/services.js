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

module.exports = {
  findSupportResistance,
  filterRecentTrendlines,
  hasStrongSlope,
  calcAveragePrice,
  calcPercentageDifference,
  calculateFee,
};
