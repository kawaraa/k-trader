import Trader from "./trader.js";
import { calcAveragePrice, calcPercentageDifference, isNumber } from "../../shared-code/utilities.js";
import { detectPriceDirection, detectPriceShapeAndPercent } from "../services/trend-analysis.js";
const calcPct = calcPercentageDifference;

// Smart trader
class SmartTrader extends Trader {
  constructor(exProvider, pair, interval, tracker) {
    super(exProvider, pair, interval, tracker);
    delete this.period;
    this.stop();
    this.prevGainPercent = 0;
    this.prevLossPercent = 0;
  }

  async trade(capital, currentPrice, eurBalance, cryptoBalance, trades, position, autoSell, testMode) {
    let signal = "unknown";
    // safeAskBidSpread
    if (calcPct(currentPrice[2], currentPrice[1]) >= 1) return { status: "low-liquidity", signal };

    // const prevTrade = trades.at(-2);
    // const lastTrade = trades.at(-1);
    const normalizePrice = calcAveragePrice([currentPrice[1], currentPrice[2]]);
    // const volumes = storedPrices.slice(-last5min).map((p) => p[3]);
    const trend = this.trackPrice(normalizePrice);
    // const move6 = this.tracker.at(-6) || [];
    // const move5 = this.tracker.at(-5) || [];
    // const move4 = this.tracker.at(-4) || [];
    // const move3 = this.tracker.at(-3) || [];
    // const move2 = this.tracker.at(-2) || [];
    // const move1 = this.tracker.at(-1) || [];
    const currentMove = this.tracker[0];

    // const sortedPrices = prices.splice(parseInt(prices.length / 3)).toSorted((a, b) => a - b);

    // const shapeResult = detectPriceShapeAndPercent(prices, 4, 1);
    // const changes = this.tracker.slice(1).map((move) => calcPct(move[0], move[1]));
    // const AvgChangesPercent = !changes[0] ? 0 : calcAveragePrice(changes);
    // const changePct = !move6[0] ? 0 : calcPct(move6[0], move[1]);
    // const [lastMinTrend, index] = detectPriceDirection(prices.slice(-last5min), 1);

    if (testMode) console.log(JSON.stringify(currentPrice), trend, this.priceLevel, this.tracker);
    const log1 = `€${eurBalance.toFixed(2)} - Change: ${this.changePct}`;
    const log2 = `Trend: ${currentMove[2]} - Price: ${normalizePrice}`;
    this.dispatch("LOG", `${log1} - ${log2}`);

    const b = isNumber(calcPct(this.priceLevel[0], normalizePrice), 1, 1.5) && currentMove[2] == "uptrend";

    if (b) signal = "dropped-increase";

    // if (move3[2] != "uptrend" && move2[2] == "uptrend" && move1[2] == "downtrend") {
    //   signal = "dropped-increase";
    // }
    // if (
    //   move2[2] == "uptrend" &&
    //   move1[2] == "uptrend" &&
    //   currentMove[2] == "uptrend" &&
    //   currentMove[1] > move1[1] &&
    //   calcPct(currentMove[0], currentMove[1]) < 2
    // )
    //   signal = "breakout";

    if (!position) {
      // Buy

      signal != "unknown" && this.dispatch("BUY_SIGNAL", currentPrice[1], signal);

      if (signal != "unknown" && capital > 0 && eurBalance >= 1 && !this.pause) {
        await this.buy(capital, eurBalance, currentPrice[1]);
        this.dispatch("LOG", `💵 Placed BUY at: ${currentPrice[1]} ${signal}`);
      }

      // Sell
    } else if (position && cryptoBalance > 0) {
      const gainLossPercent = calcPct(position.price, normalizePrice);
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      if (-gainLossPercent >= this.prevLossPercent) this.prevLossPercent = -gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);

      this.dispatch(
        "LOG",
        `📊 Current: ${gainLossPercent}% - 💰 Gain: ${this.prevGainPercent}% - 💸 Loss: ${this.prevLossPercent}%`
      );

      if (signal == "unknown") {
        const s = calcPct(this.priceLevel[1], normalizePrice) > -1.5 && currentMove[2] == "downtrend";

        if (gainLossPercent < -2 && currentMove[2] == "downtrend") signal = "stop-loss-sell";
        else if (s) signal = "take-profit-sell";
      }

      if (signal.includes("sell") && autoSell) {
        const res = await this.sell(position, cryptoBalance, currentPrice[2], signal);
        this.prevGainPercent = 0;
        this.prevLossPercent = 0;
        // if (lastTrade < 1 && gainLossPercent < 1) this.pause = true;

        this.dispatch(
          "LOG",
          `💰💸 Placed SELL -> Return: ${res.profit} - Held for: ${res.age}hrs - ${signal}`
        );
      }
    } else {
      // this.dispatch("LOG", `❌ Waiting for uptrend signal`); // Log decision
    }

    this.dispatch("LOG", "");
    return { tracker: this.tracker, status: this.pause ? "paused" : "active", signal };
  }
}

export default SmartTrader;
