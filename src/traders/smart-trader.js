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
  }

  async trade(capital, storedPrices, eurBalance, cryptoBalance, trades, position) {
    const currentPrice = storedPrices.at(-1);
    const avgAskBidSpread = calcAveragePrice(storedPrices.map((p) => calcPct(p[2], p[1])));
    // safeAskBidSpread
    if (calcAveragePrice([currentPrice[2], currentPrice[1]]) > Math.min(avgAskBidSpread * 2, 1)) {
      return this.dispatch("LOG", `Pause trading due to the low liquidity`);
    }

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
    const increasedPercent = calcPct(lowest, current);
    const droppedFromLastTrade = calcPct(lastTrade?.price || currentPrice[1], currentPrice[1]);

    // const allPricesTrend = linearRegression(prices);
    // const halfPricesTrend = linearRegression(prices.slice(-parseInt(prices.length / 2)));
    const lastMinTrend = detectPriceDirection(prices.slice(-18), 1);
    const increaseMore = detectPriceDirection(prices.slice(-18), 1.5);
    const volumeTrend = detectPriceDirection(volumes, 1);
    // const pattern3 = detectPriceShape(prices.slice(-this.calculateLength(0.75)), vLimit);
    const pattern2 = detectPriceShape(prices, 1.5);
    const dropped = droppedPercent <= -3;
    // const up = prices.at(-2) < prices.at(-1);
    let buyCase = null;

    const log1 = `€${eurBalance.toFixed(2)} - volatility: ${volatility} - Drops: ${droppedPercent}`;
    const log2 = `Trend: ${lastMinTrend} - Price: ${prices.at(-1)} - volume: ${volumeTrend}`;
    this.dispatch("LOG", `${log1} - ${log2}`);
    // this.dispatch("LOG", JSON.stringify(currentPrice).replace(/:/g, ": ").replace(/,/g, ", "));

    /*
    Buy conditions
    1. drops 3 then increase 1 && ((!lastTrade || lastTrade.return > 0) || increase 1.5)
    2. (lastTrade && lastTrade.return < 0 && drops 1 from lastTrade.price ) && increase 1
    3. (!lastTrade || lastTrade.return > 0) this.AShape && droppedPercent <= -1.5 && lastMinTrend == "uptrend";
    */
    if (!this.AShape && pattern2.shape == "A") this.AShape = true;

    if (
      droppedPercent <= -3 &&
      lastMinTrend == "uptrend" &&
      (!lastTrade || lastTrade.return > 0 || increaseMore)
    ) {
      buyCase = "dropped-increase";
    } else if (lastTrade && lastTrade.return < 0 && droppedFromLastTrade < -1 && lastMinTrend == "uptrend") {
      buyCase = "increase-again";
    } else if (this.AShape && droppedPercent <= -1.5 && lastMinTrend == "uptrend") {
      buyCase = "A-shape";
    } else {
      const sorted = prices.slice(0, prices.length - 18).toSorted((a, b) => a - b);
      if (dropped == 0 && lastMinTrend == "uptrend" && calcPct(sorted.at(-1), current) >= 0) {
        buyCase = "breakout";
      }
    }
    // Todo: Test this
    // this.buyCases[1] = volatility > 1.5 && volatility < 2 && dropped < -(volatility / 1.1);
    // if (this.buyCases[1]) console.log("BUY");
    // if (this.buyCases[1] && gainLoss >= 1.5) console.log("SELL");
    // Todo: Test this
    // this.buyCases[2] = allPricesTrend.trend != uptrend && halfPricesTrend.trend == uptrend && lastMinTrend == "uptrend" && dropped == 0;

    // Buy
    if (!position && buyCase) {
      if (this.notifiedTimer <= 0) {
        this.dispatch("BUY_SIGNAL", currentPrice[1], buyCase);
        this.notifiedTimer = (1 * 60 * 60) / this.interval;
      }

      if (capital > 0 && eurBalance >= 1) {
        await this.buy(capital, eurBalance, currentPrice[1]);
        this.dispatch("LOG", `Placed BUY at: ${currentPrice[1]} ${buyCase}`);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
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
      if (increasedPercent > 2 && lastMinTrend == "downtrend") sellCase = "take-profit-sell";
      else if (gainLossPercent < -1 && lastMinTrend == "downtrend") sellCase = "stop-loss-sell";
      else if (loss >= 3 && lastMinTrend == "downtrend") sellCase = "stop-loss-sell";

      if (sellCase) {
        const res = await this.sell(position, cryptoBalance, currentPrice[2]);
        this.AShape = false;
        this.dispatch("LOG", `Placed SELL - Return: ${res.profit} - Held for: ${res.age}hrs - ${sellCase}`);
      }

      //
    } else {
      // this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    this.dispatch("LOG", "");
  }
}

export default SmartTrader;
