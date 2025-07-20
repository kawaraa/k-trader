import Trader from "./trader.js";
import { calcAveragePrice, calcPercentageDifference } from "../../shared-code/utilities.js";
const calcPct = calcPercentageDifference;

// Smart trader
class SmartTrader extends Trader {
  constructor(exProvider, pair, interval) {
    super(exProvider, pair, interval);
    delete this.period;
    this.stop();
    this.prevGainPercent = 0;
    this.losses = [0, 0, 0];
    this.lastTradePrice = null;
    this.lasBuySignal = "";
    this.lasSellSignal = "";

    this.highestPrice = null; // Resistance Price Level
    this.lowestPrice = null; // Support Price Level
    // this.prevVolumes = [];
    this.lastTradePrice = null;
  }

  async trade(capital, price, eurBalance, cryptoBalance, trades, position, autoSell, testMode) {
    let signal = "unknown";
    if (this.pauseTimer > 0) this.pauseTimer -= 1;
    // safeAskBidSpread
    if (calcPct(price[2], price[1]) >= 1) {
      this.dispatch("LOG", `Pause trading due to the low liquidity`);
      return { status: "low-liquidity", signal };
    }
    if (testMode) console.log(price);
    // this.prevVolumes = [...this.prevVolumes.slice(-3), price[3]];

    const lastTrade = trades.at(-1);
    const current = (price[1] + price[2]) / 2;
    const volatility = calcPct(this.lowestPrice, this.highestPrice);
    const droppedPercent = calcPct(this.highestPrice, current);
    const increasedPercent = calcPct(this.lowestPrice, current);
    // const dropped = changePercent <= -3;
    // const up = prices.at(-2) < prices.at(-1);
    let buyCase = null;

    const log1 = `€${eurBalance.toFixed(2)} - Change: ${volatility} - Drops: ${droppedPercent}`;
    const log2 = `increased: ${increasedPercent} - Price: ${price}`;
    this.dispatch("LOG", `${log1} - ${log2}`);

    if (volatility > 3 && increasedPercent > 1 && increasedPercent < 2) {
      buyCase = signal = "dropped-increase";
    }

    // Buy
    if (!position && buyCase) {
      this.dispatch("BUY_SIGNAL", price[1], buyCase);

      if (capital > 0 && eurBalance >= 1 && this.pauseTimer <= 0) {
        await this.buy(capital, eurBalance, price[1]);
        this.dispatch("LOG", `Placed BUY at: ${price[1]} ${buyCase}`);
        this.prevGainPercent = 0;
        this.losses = [0, 0, 0];
        this.lasBuySignal = buyCase;
        this.highestPrice = current;
      }

      // Sell
    } else if (position && cryptoBalance > 0) {
      const gainLossPercent = calcPct(position.price, current);
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
      if (this.lowestPrice > current) sellCase = signal = "stop-loss-sell";
      else if (gainLossPercent > 2 && droppedPercent < -1) sellCase = signal = "take-profit-sell";

      if (sellCase && autoSell) {
        const res = await this.sell(position, cryptoBalance, price[2], sellCase);
        this.lastTradePrice = price[2];
        this.lasSellSignal = sellCase;
        this.lowestPrice = current;
        // if (lastTrade < 1 && gainLossPercent < 1) this.pauseTimer = (6 * 60 * 60) / 10;

        this.dispatch("LOG", `Placed SELL - Return: ${res.profit} - Held for: ${res.age}hrs - ${sellCase}`);
      }
    } else {
      // this.dispatch("LOG", `Waiting for uptrend signal`); // Log decision
    }

    if (!this.highestPrice || this.highestPrice < current) this.highestPrice = current;
    if (!this.lowestPrice || this.lowestPrice > current) this.lowestPrice = current;

    this.dispatch("LOG", "");
    return { status: this.pauseTimer > 0 ? "paused" : "active", signal };
  }
}

export default SmartTrader;
