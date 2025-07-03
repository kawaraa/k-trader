export function getCryptoTimingSuggestion() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const day = now.getUTCDate();
  const weekday = now.getUTCDay(); // 0=Sun, 6=Sat
  const month = now.getUTCMonth(); // 0=Jan, 11=Dec
  const year = now.getUTCFullYear();

  const isWeekend = weekday === 0 || weekday === 6;
  const lastFriday = new Date(Date.UTC(year, month + 1, 0)); // Last day of month
  while (lastFriday.getUTCDay() !== 5) lastFriday.setUTCDate(lastFriday.getUTCDate() - 1);

  const isLastFriday = now.toDateString() === lastFriday.toDateString();
  const isFirstDay = day === 1;
  const isQuarterlyMonth = [2, 5, 8, 11].includes(month); // Mar, Jun, Sep, Dec
  const isQuarterEnd = isLastFriday && isQuarterlyMonth;

  // Time windows
  const inAsianHours = utcHour >= 0 && utcHour < 8;
  const inUSHours = utcHour >= 14 && utcHour < 22;
  const nearMarketOpenClose = utcHour === 14 || utcHour === 21;

  // Seasonal trends
  const januaryEffect = month === 0;
  const uptober = month === 9;
  const decemberDip = month === 11;

  // Macroeconomic patterns (simplified placeholder for CPI, NFP, FOMC days)
  // const potentialMacroVolatility = [1, 5, 15].includes(day); // simulate typical CPI/NFP days

  // Decision logic
  if (isLastFriday || isQuarterEnd || isFirstDay) {
    return {
      suggestion: "wait",
      reason: "Increased volatility due to options/futures expiry or new month/quarter flow",
    };
  }

  if (isWeekend && utcHour >= 20) {
    return {
      suggestion: "wait",
      reason: "Weekend low liquidity can cause unpredictable price spikes",
    };
  }

  if (nearMarketOpenClose) {
    return {
      suggestion: "buy",
      reason: "Volatility spikes during U.S. market open/close can create breakout opportunities",
    };
  }

  if (januaryEffect) {
    return {
      suggestion: "buy",
      reason: "January effect: rebound likely after December tax-loss selling",
    };
  }

  if (uptober) {
    return {
      suggestion: "buy",
      reason: "October historically strong for crypto ('Uptober')",
    };
  }

  if (decemberDip) {
    return {
      suggestion: "sell",
      reason: "December dip: tax-loss harvesting can create downward pressure",
    };
  }

  // if (potentialMacroVolatility) {
  //   return {
  //     suggestion: "wait",
  //     reason: "Possible macroeconomic event day (e.g. CPI or NFP); wait for clarity",
  //   };
  // }

  if (inUSHours) {
    return {
      suggestion: "buy",
      reason: "U.S. trading hours bring high liquidity and potential breakout moves",
    };
  }

  if (inAsianHours) {
    return {
      suggestion: "watch",
      reason: "Asian markets active, watch for early-morning breakouts",
    };
  }

  return {
    suggestion: "wait",
    reason: "No strong signal at this time",
  };
}

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
