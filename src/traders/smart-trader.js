import Trader from "./trader.js";
import { calcAveragePrice, calcPercentageDifference } from "../../shared-code/utilities.js";
const calcPct = calcPercentageDifference;

// Smart trader
class SmartTrader extends Trader {
  constructor(exProvider, pair, interval, { tracker, pricesChanges }) {
    super(exProvider, pair, interval, tracker, pricesChanges);
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
    const trend = this.trackPrice(normalizePrice, currentPrice[3]);
    const currentMove = this.tracker[0];
    const move1 = this.tracker.at(-1) || [];
    const move2 = this.tracker.at(-2) || [];
    const move3 = this.tracker.at(-3) || [];

    if (testMode) console.log(JSON.stringify(currentPrice), "\n", trend, this.priceLevel, "\n", this.tracker);
    const log1 = `€${eurBalance.toFixed(2)} - Change: ${this.changePct}`;
    const log2 = `Trend: ${currentMove.at(-1)} - Price: ${normalizePrice}`;
    this.dispatch("LOG", `${log1} - ${log2}`);

    if (this.tracker.length >= 3) {
      const avgChange = calcAveragePrice(this.pricesChanges, 9);
      const nearSupport = calcPct(this.priceLevel[0], normalizePrice);
      if (
        !(this.changePct > 9) &&
        move2.at(-1) == "uptrend" &&
        move1.at(-1) == "downtrend" &&
        currentMove.at(-1) == "uptrend" &&
        nearSupport < 4
        // && isNumber(calcPct(currentMove[0], normalizePrice), 1, 1.5)
      ) {
        signal = "dropped-increase";
      }
      if (
        nearSupport < 4 &&
        move2.at(-1) == "downtrend" &&
        move1.at(-1) == "downtrend" &&
        calcPct(move2[1], normalizePrice) < -avgChange &&
        currentMove.at(-1) == "uptrend"
      ) {
        signal = "near-support";
      }
      if (
        move2.at(-1) == "downtrend" &&
        move1.at(-1) == "downtrend" &&
        calcPct(move2[1], normalizePrice) < -avgChange &&
        currentMove.at(-1) == "uptrend" &&
        calcPct(move1[1], normalizePrice) > 0
      ) {
        signal = "above-resistance";
      }
      if (
        nearSupport < 4 &&
        move3.at(-1) == "downtrend" &&
        move2.at(-1) == "downtrend" &&
        move1.at(-1) == "uptrend" &&
        calcPct(move1[1], normalizePrice) <= 2 &&
        currentMove.at(-1) == "uptrend"
      ) {
        signal = "breakout";
      }
    }

    if (!position) {
      // Buy

      signal != "unknown" && this.dispatch("BUY_SIGNAL", currentPrice[1], signal);

      if (signal != "unknown" && capital > 0 && eurBalance >= 1) {
        await this.buy(capital, eurBalance, currentPrice[1]);
        this.dispatch("LOG", `💵 Placed BUY at: ${currentPrice[1]} ${signal}`);
      }

      // Sell
    } else if (position && cryptoBalance > 0) {
      const gainLossPercent = calcPct(position.price, normalizePrice);
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      if (-gainLossPercent >= this.prevLossPercent) this.prevLossPercent = -gainLossPercent;
      // const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);

      this.dispatch(
        "LOG",
        `📊 Current: ${gainLossPercent}% - 💰 Gain: ${this.prevGainPercent}% - 💸 Loss: ${this.prevLossPercent}%`
      );

      if (signal == "unknown") {
        const profitTarget = Math.max(this.changePct / 1.2, 5);
        if (gainLossPercent > profitTarget && currentMove.at(-1) == "downtrend") signal = "take-profit-sell";
        else if (gainLossPercent <= -2) signal = "stop-loss-sell";
      }

      if (signal.includes("sell") && autoSell) {
        const res = await this.sell(position, cryptoBalance, currentPrice[2], signal);
        this.prevGainPercent = 0;
        this.prevLossPercent = 0;

        this.dispatch(
          "LOG",
          `💰💸 Placed SELL -> Return: ${res.profit} - Held for: ${res.age}hrs - ${signal}`
        );
      }
    } else {
      // this.dispatch("LOG", `❌ Waiting for uptrend signal`); // Log decision
    }

    this.dispatch("LOG", "");
    return { tracker: this.tracker, signal };
  }
}

export default SmartTrader;
