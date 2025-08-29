import Trader from "./trader.js";
import { calcAveragePrice, calcPercentageDifference, isNumber } from "../../shared-code/utilities.js";
const calcPct = calcPercentageDifference;

// Smart trader
class SmartTrader extends Trader {
  constructor(exProvider, pair, interval, { smallChanges, bigChanges }) {
    super(exProvider, pair, interval);
    delete this.period;
    this.stop();
    this.prevGainPercent = 0;
    this.prevLossPercent = 0;
    this.prevSignal = null;
    this.prevPrice = null;
    this.volatility = [];
    this.smallChanges = smallChanges || [[null, null, null, null]];
    this.bigChanges = bigChanges || [[null, null, null, null]];
    this.widePriceLevel = [];
    this.tightPriceLevel = [];
    this.wideChangePct = 0;
    this.tightChangePct = 0;
  }

  async run(capital, currentPrice, eurBalance, cryptoBalance, command, position, autoSell, testMode) {
    // if (this.pauseTimer > 0) this.pauseTimer -= 1;
    // if (this.notifiedTimer > 0) this.notifiedTimer -= 1;
    let signal = "unknown";
    const safeAskBidSpread = calcPct(currentPrice[2], currentPrice[1]);

    if (!isNumber(safeAskBidSpread, 0, 1)) {
      this.dispatch("LOG", `low-liquidity AskBidSPread: ${safeAskBidSpread}`);
      return { signal: "low-liquidity" };
    }

    const normalizePrice = calcAveragePrice([currentPrice[1], currentPrice[2]]);

    const bigChangeTrend = this.trackPrice(normalizePrice, currentPrice[3]);
    const bMove3 = this.bigChanges.at(-3) || [];
    const bMove2 = this.bigChanges.at(-2) || [];
    const bMove1 = this.bigChanges.at(-1) || [];
    const bMove0 = this.bigChanges[0];

    const sHigh3 = this.smallChanges.at(-3) || [];
    const sHigh2 = this.smallChanges.at(-2) || [];
    const sHigh1 = this.smallChanges.at(-1) || [];
    const sMove0 = this.smallChanges[0];

    if (testMode) console.log(JSON.stringify(currentPrice), "\n", this.bigChanges, "\n", this.smallChanges);
    const log1 = `€${eurBalance.toFixed(2)} - Change: ${this.wideChangePct}`;
    const log2 = `Trend: ${sMove0[2]} - Price: ${normalizePrice}`;
    this.dispatch("LOG", `${log1} - ${log2} - CMD: ${JSON.stringify(command)}`);

    if (this.smallChanges.length > 3 && this.bigChanges.length >= 1) {
      const notHigh = calcPct(bMove0[0], normalizePrice) <= 3.5; // missed out
      const upDownSameLength = bMove1[2] == "up" && bMove0[3] > 10 && isNumber(bMove1[3] - bMove0[3], 0, 2);
      const hardBreakdown = bMove3[2] == "down" && bMove3[3] >= 15;

      const consolidationThenBreakout =
        this.tightChangePct <= 3 &&
        sMove0[1] > Math.max(sHigh1[1], sHigh2[1], sHigh3[1]) * 1.005 &&
        normalizePrice > this.prevPrice;

      const increasing =
        sMove0[1] > sHigh1[1] * 1.005 && sMove0[0] > sHigh1[0] * 1.005 && normalizePrice > this.prevPrice;

      const gradualIncreasing =
        sMove0[0] > sHigh1[0] &&
        sHigh1[0] > sHigh2[0] &&
        sHigh2[0] > sHigh3[0] &&
        (sMove0[1] > sHigh1[1] || sHigh1[1] > sHigh2[1] || sHigh2[1] > sHigh3[1]);

      // Buy cases:
      const case1 =
        bMove1[2] == "up" &&
        bMove0[2] == "down" &&
        (isNumber(calcPct(bMove1[0], bMove0[0]), -1.5, 0) || upDownSameLength) &&
        (consolidationThenBreakout || increasing) &&
        notHigh;

      const case2 =
        bMove2[2] == "up" &&
        bMove1[2] == "down" &&
        isNumber(calcPct(bMove2[0], bMove0[0]), -1.5, hardBreakdown ? 1 : 0) &&
        sMove0[1] > sHigh1[1] &&
        notHigh;

      // Trending up
      const case3 =
        bMove3[2] == "up" &&
        bMove2[2] == "down" &&
        bMove1[2] == "up" &&
        bMove0[2] == "down" &&
        bMove0[0] >= bMove1[0] &&
        bMove1[0] >= bMove2[0] &&
        bMove2[0] >= bMove3[0] &&
        isNumber(calcPct(bMove1[0], bMove0[0]), 0, 3.5) &&
        calcPct(bMove0[0], normalizePrice) >= 3 &&
        (consolidationThenBreakout || increasing || gradualIncreasing);

      const case4 = bMove3[2] == "down" && bMove2[2] == "down" && bMove1[2] == "down" && notHigh;

      const case5 =
        command &&
        isNumber(normalizePrice, command.buyPrice * 0.997, command.buyPrice * 1.003) &&
        normalizePrice > this.prevPrice;
      // console.log(
      //   calcPct(bMove1[0], bMove0[0]),
      //   calcPct(bMove0[0], normalizePrice),
      //   consolidationThenBreakout,
      //   increasing,
      //   gradualIncreasing
      // );

      if (case1 || case2 || case3 || case4 || case5) {
        signal = "buy";
        this.dispatch("LOG", `Buy case: ${case1}-${case2}-${case3}-${case4}-${case5}`);
      }
    }

    if (position && cryptoBalance < 0.00001) this.dispatch("SELL", 0, "via-ex");
    if (!position) {
      // Buy

      if (signal != "unknown" && capital > 0 && eurBalance >= 1) {
        await this.buy(capital, eurBalance, currentPrice[1]);
        this.dispatch("LOG", `💵 Placed BUY at: ${currentPrice[1]} ${signal}`);
        this.prevGainPercent = 0;
        this.prevLossPercent = 0;
        this.stopLossPrice = bMove0[2] == "down" ? bMove0[0] : bMove1[0]; // * 0.99;
        if (command) this.stopLossPrice = sMove0[0];
        this.profitTarget = parseInt(Math.max(bMove0[3] / 1.2 || 0, 8));
      }

      // Sell
    } else if (position && cryptoBalance > 0) {
      const gainLossPercent = calcPct(position.price, normalizePrice);
      if (gainLossPercent > this.prevGainPercent) this.prevGainPercent = gainLossPercent;
      if (-gainLossPercent >= this.prevLossPercent) this.prevLossPercent = -gainLossPercent;
      const loss = +(this.prevGainPercent - gainLossPercent).toFixed(2);

      this.dispatch(
        "LOG",
        `📊 Current: ${gainLossPercent}% - 🎯 target: ${this.profitTarget} - 💰 Gain: ${this.prevGainPercent}% - 💸 Loss: ${this.prevLossPercent}%`
      );

      const gain = bMove0[2] == "up" ? Math.max(this.prevGainPercent, bMove0[3]) : this.prevGainPercent;
      const down = sHigh2[1] > sHigh1[1] || Math.abs(calcPct(sHigh2[1], sHigh1[1])) <= 0.5;
      const dropping = loss > 2 || down || (bMove1[2] == "up" && bMove0[2] == "down");

      if (command) {
        const commandTakProfit = normalizePrice >= command?.sellPrice && normalizePrice < this.prevPrice;
        const commandStopLoss = normalizePrice < command?.buyPrice * 0.99;
        const action = commandTakProfit ? "take-profit" : "stop-loss";
        if (commandTakProfit || commandStopLoss) signal = `command-${action}-sell`;
      } else {
        if (gain >= this.profitTarget && dropping) signal = "take-profit-sell";
        else if (normalizePrice < this.stopLossPrice * 0.99 && loss > 2) signal = "stop-loss-sell";
      }

      if (signal.includes("sell") && (autoSell || command)) {
        const res = await this.sell(position, cryptoBalance, currentPrice[2], signal);
        this.prevGainPercent = 0;
        this.prevLossPercent = 0;
        if (gainLossPercent <= 0) command = null;
        this.dispatch(
          "LOG",
          `💰💸 Placed SELL -> Return: ${res.profit} - Held for: ${res.age}hrs - ${signal}`
        );
      }
    } else {
      // this.dispatch("LOG", `❌ Waiting for uptrend signal`); // Log decision
    }

    this.prevPrice = normalizePrice;
    this.dispatch("LOG", "");

    return {
      safeAskBidSpread,
      bigChanges: this.bigChanges,
      smallChanges: this.smallChanges,
      trend: bigChangeTrend,
      signal,
      command,
    };
  }

  trackPrice(price, volume) {
    // Track Big Changes
    const minBigChange = 8;
    if (!this.bigChanges[0][0] || this.bigChanges[0][0] > price) this.bigChanges[0][0] = price;
    if (!this.bigChanges[0][1] || this.bigChanges[0][1] < price) this.bigChanges[0][1] = price;

    if (price <= this.bigChanges[0][0]) this.bigChanges[0][2] = "down";
    if (price >= this.bigChanges[0][1]) this.bigChanges[0][2] = "up";

    const bigNearLow = Math.abs(calcPct(this.bigChanges[0][0], price));
    const bigNearHigh = Math.abs(calcPct(this.bigChanges[0][1], price));
    const bigChange = calcPct(this.bigChanges[0][0], this.bigChanges[0][1]);
    this.bigChanges[0][3] = bigChange;

    if (bigChange >= minBigChange) {
      const limit = bigChange / 2.5;
      if (this.bigChanges[0][2] == "up" && bigNearHigh >= limit) {
        this.bigChanges.push(this.bigChanges[0]);
        this.bigChanges[0] = [price, this.bigChanges[0][1], "down"];
      } else if (this.bigChanges[0][2] == "down" && bigNearLow >= limit) {
        this.bigChanges.push(this.bigChanges[0]);
        this.bigChanges[0] = [this.bigChanges[0][0], price, "up"];
      }
    }

    if (this.bigChanges.length > 4) this.bigChanges.splice(1, 1);

    const prices = this.bigChanges.map((c) => [c[0], c[1]]).flat();
    this.widePriceLevel[0] = !prices[0] ? price : Math.min(...prices);
    this.widePriceLevel[1] = !prices[0] ? price : Math.max(...prices);
    this.wideChangePct = calcPct(this.widePriceLevel[0], this.widePriceLevel[1]) || 0;

    //
    // Track Small Changes
    //
    const move = !this.prevPrice ? 0 : Math.abs(calcPct(this.prevPrice, price));
    if (move > 0) this.volatility.push(move);
    if (this.volatility.length > 6 * 3) this.volatility.shift();
    const minSmallChange = calcAveragePrice(this.volatility, 0.7) * 6;

    if (!this.smallChanges[0][0] || this.smallChanges[0][0] > price) {
      this.smallChanges[0][0] = price; // Support Price Level
    }
    if (!this.smallChanges[0][1] || this.smallChanges[0][1] < price) {
      this.smallChanges[0][1] = price; // Resistance Price Level
    }

    if (price <= this.smallChanges[0][0]) this.smallChanges[0][2] = "down";
    if (price >= this.smallChanges[0][1]) this.smallChanges[0][2] = "up";

    const nearLow = Math.abs(calcPct(this.smallChanges[0][0], price));
    const nearHigh = Math.abs(calcPct(this.smallChanges[0][1], price));
    const change = calcPct(this.smallChanges[0][0], this.smallChanges[0][1]);
    this.smallChanges[0][3] = change;

    if (change > 4) this.smallChanges[0] = [price, price, ""];
    if (change > minSmallChange) {
      const limit = Math.max(change / 2.5, 0.3);
      if (this.smallChanges[0][2] == "up" && nearHigh > limit) {
        this.smallChanges.push(this.smallChanges[0]);
        this.smallChanges[0] = [price, this.smallChanges[0][1], "down"];
      } else if (this.smallChanges[0][2] == "down" && nearLow > limit) {
        this.smallChanges[0] = [this.smallChanges[0][0], price, "up"];
      }

      if (this.smallChanges.length > 4) this.smallChanges.splice(1, 1);

      const prices = this.smallChanges
        .slice(1)
        .map((c) => [c[0], c[1]])
        .flat();
      this.tightPriceLevel[0] = !prices[0] ? price : Math.min(...prices);
      this.tightPriceLevel[1] = !prices[0] ? price : Math.max(...prices);
      this.tightChangePct = calcPct(this.tightPriceLevel[0], this.tightPriceLevel[1]) || 0;
    }

    return this.bigChanges.at(-1)[2];
  }
}

export default SmartTrader;
