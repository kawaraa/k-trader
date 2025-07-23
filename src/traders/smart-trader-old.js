import Trader from "./trader.js";
import { calcPercentageDifference, isNumber } from "../../shared-code/utilities.js";
import { normalizePrices } from "../services/calc-methods.js";
import { detectPriceDirection } from "../services/trend-analysis.js";
const calcPct = calcPercentageDifference;

// Smart trader
class SmartTrader extends Trader {
  constructor(exProvider, pair, interval, tracker) {
    super(exProvider, pair, interval, tracker);
    delete this.period;
    this.stop();
    this.prevGainPercent = 0;
    this.prevLossPercent = 0;
    this.buySignal = "";
    this.prevBuySignal = "";
    this.sellSignal = "";
    // this.prevSellSignal = "";
  }

  async trade(capital, storedPrices, eurBalance, cryptoBalance, trades, position, autoSell, testMode) {
    let signal = "unknown";
    const last5min = 18;
    const currentPrice = storedPrices.at(-1);
    // safeAskBidSpread
    if (calcPct(currentPrice[2], currentPrice[1]) >= 1) return { status: "low-liquidity", signal };

    const prevTrade = trades.at(-2);
    const lastTrade = trades.at(-1);
    const prices = normalizePrices(storedPrices);
    const volumes = storedPrices.slice(-last5min).map((p) => p[3]);
    const sortedPrices = prices.toSorted((a, b) => a - b);
    // const start = prices[0];
    const lowest = sortedPrices[0];
    const highest = sortedPrices.at(-1);
    const current = prices.at(-1);
    const volatility = calcPct(lowest, highest);
    const changePercent = calcPct(highest, current);
    // const increasedPercent = calcPct(lowest, current);
    const [lastMinTrend, index] = detectPriceDirection(prices.slice(-last5min), 1);
    const [volumeTrend] = detectPriceDirection(volumes, 1);
    const trend = this.trackPrice(current);

    if (testMode) console.log(JSON.stringify(currentPrice), trend);
    const log1 = `€${eurBalance.toFixed(2)} - Change: ${volatility} - Drops: ${changePercent}`;
    const log2 = `Trend: ${lastMinTrend} - Price: ${prices.at(-1)} - Volume: ${volumeTrend}`;
    this.dispatch("LOG", `${log1} - ${log2}`);

    if (!position) {
      // Buy

      if (!this.pause && lastTrade > 0 && prevTrade > 0 && lastTrade + prevTrade > 6) this.pause = true;
      if (this.pause) {
        const breakout = calcPct(prices[0], lowest) == 0 && lastMinTrend == "uptrend";

        if (breakout || (trend == "uptrend" && !(lastTrade + prevTrade > 6))) this.pause = false;
      }

      const currentMove = this.tracker[0];
      const lastMove = this.tracker.length > 1 ? this.tracker.at(-1) : [];
      const recentDowntrend =
        lastMove[2] == "downtrend" && isNumber(calcPct(lastMove[0], currentMove[0]), -1, 1);
      const increasedAgain = calcPct(currentMove[0], currentMove[1]) > 1 && currentMove[1] == current;

      if (recentDowntrend && increasedAgain && changePercent <= -2 && lastMinTrend == "uptrend") {
        signal = "dropped-increase";
      } else {
        const newPrices = prices.slice(0, prices.length - index);
        const highest = newPrices.toSorted((a, b) => a - b).at(-1);
        if (
          (volatility <= 3 || (volatility <= 5 && trend == "uptrend")) &&
          changePercent == 0 &&
          lastMinTrend == "uptrend" &&
          calcPct(highest, newPrices.at(-1)) > -0.25 &&
          !(this.prevBuySignal == "breakout" && lastTrade < 1) // finished Breakout
        ) {
          signal = "breakout";
        }
      }

      signal != "unknown" && this.dispatch("BUY_SIGNAL", currentPrice[1], signal);

      if (signal != "unknown" && capital > 0 && eurBalance >= 1 && !this.pause) {
        await this.buy(capital, eurBalance, currentPrice[1], signal);
        this.dispatch("LOG", `💵 Placed BUY at: ${currentPrice[1]} ${signal}`);
        this.prevBuySignal = this.buySignal;
        this.buySignal = signal;
      }

      // Sell
    } else if (position && cryptoBalance > 0) {
      const gainLossPercent = calcPct(position.price, prices.at(-1));
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      if (-gainLossPercent >= this.prevLossPercent) this.prevLossPercent = -gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);

      this.dispatch(
        "LOG",
        `📊 Current: ${gainLossPercent}% - 💰 Gain: ${this.prevGainPercent}% - 💸 Loss: ${this.prevLossPercent}%`
      );

      if (gainLossPercent <= -2 && lastMinTrend == "downtrend") signal = "stop-loss-sell";
      else if (gainLossPercent > 3 && lastMinTrend == "downtrend") signal = "take-profit-sell";
      else if (this.buySignal == "breakout" && this.prevGainPercent > 2 && loss > 0.5) {
        signal = "breakout-take-profit-sell";
      }

      if (signal != "unknown" && autoSell) {
        const res = await this.sell(position, cryptoBalance, currentPrice[2], signal);
        this.prevGainPercent = 0;
        this.prevLossPercent = 0;
        // this.prevSellSignal = this.sellSignal;
        this.sellSignal = signal;
        if (lastTrade < 1 && gainLossPercent < 1) this.pause = true;

        this.dispatch(
          "LOG",
          `💰💸 Placed SELL -> Return: ${res.profit} - Held for: ${res.age}hrs - ${signal}`
        );
      }
    } else {
      // this.dispatch("LOG", `❌ Waiting for uptrend signal`); // Log decision
    }

    this.dispatch("LOG", "");
    return {
      change: changePercent,
      status: this.pause ? "paused" : "active",
      signal,
      tracker: this.tracker,
    };
  }
}

export default SmartTrader;
