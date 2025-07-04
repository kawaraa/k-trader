import Trader from "./trader.js";
import { calcAveragePrice, calcPercentageDifference } from "../../shared-code/utilities.js";
import { normalizePrices } from "../services/calc-methods.js";
import { detectPriceDirection, detectPriceShape } from "../services/trend-analysis.js";
const calcPct = calcPercentageDifference;

// Smart trader
class SmartTrader extends Trader {
  constructor(exProvider, pair, interval) {
    super(exProvider, pair, interval);
    delete this.period;
    this.stop();
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.AShape = false;
    this.lastTradePrice = null;
    this.lasBuySignal = null;
    this.lasSellSignal = null;
    this.lastMinTrends = [];
  }

  async trade(capital, storedPrices, eurBalance, cryptoBalance, trades, position, autoSell, testMode) {
    let signal = "unknown";
    const currentPrice = storedPrices.at(-1);
    const avgAskBidSpread = calcAveragePrice(storedPrices.map((p) => calcPct(p[2], p[1])));
    if (this.pauseTimer > 0) this.pauseTimer -= 1;
    // safeAskBidSpread

    if (calcPct(currentPrice[2], currentPrice[1]) > Math.min(Math.max(avgAskBidSpread * 2, 0.2), 1)) {
      this.dispatch("LOG", `Pause trading due to the low liquidity`);
      return "paused";
    }
    if (testMode) console.log(currentPrice);

    const lastTrade = trades.at(-1);
    const prices = normalizePrices(storedPrices);
    const volumes = storedPrices.slice(-18).map((p) => p[3]);
    const sortedPrices = prices.toSorted((a, b) => a - b);
    const start = prices[0];
    const lowest = sortedPrices[0];
    const highest = sortedPrices.at(-1);
    const current = prices.at(-1);
    // const percentFromStartToLowest = calcPct(start, lowest);
    // const percentFromStartToHighest = calcPct(start, highest);
    // const percentFromLowestToCurrent = calcPct(lowest, current);
    const volatility = calcPct(lowest, highest);
    const droppedPercent = calcPct(highest, current);
    // const increasedPercent = calcPct(lowest, current);
    const droppedFromLastTrade = calcPct(this.lastTradePrice || currentPrice[1], currentPrice[1]);

    // const allPricesTrend = linearRegression(prices);
    // const halfPricesTrend = linearRegression(prices.slice(-parseInt(prices.length / 2)));
    const lastMinTrend = detectPriceDirection(prices.slice(-18), 1);
    // const increaseMore = detectPriceDirection(prices.slice(-18), 1.5);
    const volumeTrend = detectPriceDirection(volumes, 1);
    // const pattern3 = detectPriceShape(prices.slice(-this.calculateLength(0.75)), vLimit);
    const pattern2 = detectPriceShape(prices, 1.5);
    const dropped = droppedPercent <= -3;
    // const up = prices.at(-2) < prices.at(-1);
    let buyCase = null;

    const log1 = `€${eurBalance.toFixed(2)} - Change: ${volatility} - Drops: ${droppedPercent}`;
    const log2 = `Trend: ${lastMinTrend} - Price: ${prices.at(-1)} - Volume: ${volumeTrend}`;
    this.dispatch("LOG", `${log1} - ${log2}`);
    // this.dispatch("LOG", JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", "));

    /*
    Buy conditions
    1. drops 3 then increase 1 && ((lastTrade > 0) || increase 1.5)
    2. (lastTrade < 0 && drops 1 from this.lastTradePrice ) && increase 1
    3. (lastTrade > 0) this.AShape && droppedPercent <= -1.5 && lastMinTrend == "uptrend";
    */
    if (!this.AShape && pattern2.shape == "A") this.AShape = true;
    if (droppedPercent <= -3 && this.lasSellSignal.includes("breakout")) {
      this.lastMinTrends = [this.lastMinTrends.at(-1), lastMinTrend];
      if (this.lastMinTrends[0] == "uptrend" && this.lastMinTrends[0] == "downtrend") {
        this.lasSellSignal = null;
      }
    }

    if (droppedPercent <= -3 && lastMinTrend == "uptrend" && !this.lasSellSignal.includes("breakout")) {
      // && (lastTrade > 0 || increaseMore)
      buyCase = signal = "dropped-increase";
    } else if (lastTrade < 0 && droppedFromLastTrade < -1 && lastMinTrend == "uptrend") {
      buyCase = signal = "increase-again";
    } else if (volatility < 2 && this.AShape && droppedPercent <= -1.5 && lastMinTrend == "uptrend") {
      buyCase = signal = "A-shape";
    } else {
      const sorted = prices.slice(0, prices.length - 18).toSorted((a, b) => a - b);
      if (
        volatility < 2 &&
        dropped == 0 &&
        lastMinTrend == "uptrend" &&
        calcPct(sorted.at(-1), current) >= 0 &&
        !(lastTrade < 0 && this.lasBuySignal == "breakout")
      ) {
        buyCase = signal = "breakout";
      }
    }
    // Todo: Test this for 6 hrs range and 1% profit
    // if(volatility > 1.5 && volatility < 2 && dropped < -(volatility / 1.1)) buyCase = drop-1;
    // if (buyCase == drop-1 && gainLossPercent >= 1.5) sellCase = "take-1-sell"

    // Buy
    if (!position && buyCase) {
      this.dispatch("BUY_SIGNAL", currentPrice[1], buyCase);

      if (capital > 0 && eurBalance >= 1 && this.pauseTimer <= 0) {
        await this.buy(capital, eurBalance, currentPrice[1]);
        this.dispatch("LOG", `Placed BUY at: ${currentPrice[1]} ${buyCase}`);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        this.lasBuySignal = buyCase;
      }

      // Sell
    } else if (position && cryptoBalance > 0) {
      const gainLossPercent = calcPct(position.price, prices.at(-1));
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);

      if (-gainLossPercent >= this.losses[0]) this.losses[0] = -gainLossPercent;
      else if (this.losses[0]) {
        if (gainLossPercent > 0) this.losses[1] = this.losses[0];
        else {
          const recoveredPercent = +(this.losses[0] - -gainLossPercent).toFixed(2);
          if (recoveredPercent > this.losses[1]) this.losses[1] = recoveredPercent;
        }
      }

      this.dispatch(
        "LOG",
        `Current: ${gainLossPercent}% - Gain: ${this.prevGainPercent}% - Loss: ${this.losses[0]}% - Recovered: ${this.losses[1]}% - DropsAgain: ${this.losses[2]}%`
      );

      let sellCase = null;
      if (loss >= 3 && lastMinTrend == "downtrend") sellCase = signal = "stop-loss-sell";
      else if (gainLossPercent <= -1 && lastMinTrend == "downtrend") sellCase = signal = "stop-loss-sell";
      else if (gainLossPercent > 2 && lastMinTrend == "downtrend") sellCase = signal = "take-profit-sell";
      else if (this.prevGainPercent > 2 && this.lasBuySignal == "breakout" && loss > 0.5) {
        sellCase = signal = "take-breakout-profit-sell";
      }

      if (sellCase && autoSell) {
        const res = await this.sell(position, cryptoBalance, currentPrice[2], sellCase);
        this.AShape = false;
        if (gainLossPercent > 2) this.lastTradePrice = currentPrice[2];
        else {
          this.lastTradePrice = null;
          if ((gainLossPercent < 0) & (this.lasBuySignal == "breakout")) this.pauseTimer = (6 * 60 * 60) / 10;
        }
        this.lasSellSignal = sellCase;
        this.dispatch("LOG", `Placed SELL - Return: ${res.profit} - Held for: ${res.age}hrs - ${sellCase}`);
      }
    } else {
      // this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    this.dispatch("LOG", "");
    return signal;
  }
}

export default SmartTrader;
