const Trader = require("./trader");
const indicators = require("../indicators");
const services = require("../services");
const { isNumberInRangeOf } = require("../utilities");
const fixNum = (n) => +n.toFixed(2);

class IntermediateTrader extends Trader {
  constructor(exProvider, pair, { interval, capital, mode }) {
    super(exProvider, pair, interval, capital, mode);
    this.rsi = [];
    this.decisions = ["HOLD"];
    this.position = null;
  }

  async run() {
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const position = this.testMode ? this.position : (await this.ex.getOrders(this.pair))[0];
    const currentPrice = await this.ex.currentPrices(this.pair); // { tradePrice, askPrice, bidPrice }
    const ohlc = await this.ex.pricesData(this.pair, this.interval); // Returns 720 item (720 * 5 / 60 = 60hrs)

    const closes = ohlc.map((d) => d.close);
    this.rsi.push(indicators.calculateRSI(closes, this.rsiPeriod));
    if (this.rsi.length < 2) this.rsi.push(this.rsi[0]);
    if (this.rsi.length > 2) this.rsi.shift();

    const decision = this.decideBaseOnScore(ohlc);
    if (decision !== "HOLD") this.decisions.push(decision);
    if (this.decisions.length > 2) this.decisions.shift();

    const log = this.testMode ? "TEST:" : "";

    if (this.decisions.every((d) => d === "BUY")) {
      this.dispatch("LOG", `${log} [+] Breakout detected.`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      if (!position) await this.placeOrder("BUY", capital, currentPrice.askPrice);
      //
    } else if (this.decisions.every((d) => d === "SELL")) {
      this.dispatch("LOG", `${log} [-] Breakdown detected.`);
      if (position) await this.placeOrder("SELL", balance.crypto, currentPrice.bidPrice, position);
    } else {
      this.dispatch("LOG", `${log} [=] No trade signal. decision: ${this.decisions.join("-")}`);
    }
  }

  // ===== breakout breakdown based Strategy
  decideBaseOnScore(data) {
    const currentRSI = this.rsi.at(-1);
    const prevRSI = this.rsi.at(-2);
    const last = data.at(-1);
    const prev = data.at(-2);

    const period = 6;
    const avgVolume = data.slice(-period).reduce((sum, d) => sum + d.volume, 0) / period;
    const volumeRising = indicators.isVolumeRising(data.slice(-5));

    const { support, resistance } = services.findSupportResistance(data.slice(-20));
    const pattern = indicators.detectCandlestickPattern(data);
    const trend = indicators.detectTrend(data.slice(-30));

    const shortData = data.slice(-15).map((d) => d.close);
    const slopeTrend = indicators.linearRegression(shortData, true);
    const trendlines = indicators.detectTrendlines(data);

    const maxPivotAge = 30;
    const lng = data.length;
    const recentSupportPivots = services.filterRecentTrendlines(trendlines.support, lng, maxPivotAge);
    const recentResistancePivots = services.filterRecentTrendlines(trendlines.resistance, lng, maxPivotAge);

    const validSupport = indicators.hasStrongSlope(recentSupportPivots, "low", 0.05);
    const validResistance = indicators.hasStrongSlope(recentResistancePivots, "high", 0.05);

    const brokeResistanceLine =
      validResistance && recentResistancePivots.some((pivot) => last.close > pivot.high);
    const brokeSupportLine = validSupport && recentSupportPivots.some((pivot) => last.close < pivot.low);
    const volumeDivergence = indicators.detectVolumeDivergence(data.slice(-8));

    const score = { breakout: 0, breakdown: 0 };

    // BREAKOUT CONDITIONS
    if (last.close > resistance) score.breakout += 2;
    if (brokeResistanceLine) score.breakout += 2;
    if (currentRSI > 52 && currentRSI - prevRSI > 2) score.breakout += 1;
    if (currentRSI > 55 && currentRSI - prevRSI > 5) score.breakout += 1;
    if (pattern === "bullish-engulfing") {
      if (last.close > last.open && prev.close < prev.open) {
        if (last.close > support && last.close < support * 1.02) {
          score.breakout += 2; // give more weight if pattern is near support
        } else {
          score.breakout += 1; // normal weight if pattern is not near support
        }
      }
    }
    if (pattern === "hammer") {
      if (last.close > last.open && prev.low < support) {
        score.breakout += 2; // Hammer pattern at support is strong indication of reversal
      } else {
        score.breakout += 1;
      }
    }
    if (pattern === "morning-star") {
      if (prev.close < support && last.close > support) {
        score.breakout += 3; // The pattern must form after a pullback to support and show a reversal
      } else {
        score.breakout += 1;
      }
    }
    if (pattern === "doji" && trend === "uptrend") score.breakout += 1;
    if (trend === "uptrend" && slopeTrend === "uptrend") {
      score.breakout += volumeDivergence == "weak-uptrend" ? 1 : 2;
    }

    // BREAKDOWN CONDITIONS
    if (last.close < support) score.breakdown += 2;
    if (brokeSupportLine) score.breakdown += 2;
    if (currentRSI < 48 && prevRSI - currentRSI > 2) score.breakdown += 1;
    if (currentRSI < 45 && prevRSI - currentRSI > 5) score.breakdown += 1;
    if (["dark-cloud-cover"].includes(pattern)) score.breakdown += 2;
    if (pattern === "bearish-engulfing") {
      if (last.close < last.open && prev.close > prev.open) {
        if (last.close < resistance && last.close > resistance * 0.98) {
          score.breakdown += 2; // give more weight if pattern is near resistance
        } else {
          score.breakdown += 1; // normal weight if pattern is not near resistance
        }
      }
    }
    if (pattern === "shooting-star") {
      if (last.close < last.open && last.high > resistance) {
        score.breakdown += 2; // Shooting star at resistance is strong indication of reversal
      } else {
        score.breakdown += 1;
      }
    }

    if (pattern === "doji" && trend === "downtrend") score.breakdown += 1;
    if (pattern === "evening-star") score.breakdown += 2;
    if (trend === "downtrend" && slopeTrend === "downtrend") {
      score.breakdown += volumeDivergence == "weak-downtrend" ? 1 : 2;
    }

    if (last.volume > prev.volume && isNumberInRangeOf(last.volume, avgVolume, avgVolume * 2)) {
      if (trend === "uptrend") score.breakout += 1;
      if (trend === "downtrend") score.breakdown += 1;
    }
    if (volumeRising) {
      if (trend === "uptrend") score.breakout += 1;
      if (trend === "downtrend") score.breakdown += 1;
    }

    // console.log(score);

    // === FAKEOUT PROTECTION ===
    // If resistance line broke but retraced or volume is low, lower breakout score
    // if (brokeResistanceLine) {
    //   const retracedResistance = last.close < resistance && prev.close < resistance;
    //   const recentCloseBelowResistance = data.slice(-3).every((d) => d.close < resistance);
    //   if (retracedResistance || (recentCloseBelowResistance && last.volume < avgVolume)) {
    //     score.breakout = Math.max(0, score.breakout - 1);
    //     if (last.close < resistance - resistance * 0.002) {
    //       score.breakout = Math.max(0, score.breakout - 1);
    //     }
    //   }
    // }

    // // If support line broke but retraced, lower breakdown score
    // if (brokeSupportLine) {
    //   const retracedSupport = last.close > support && prev.close > support;
    //   const recentCloseAboveSupport = data.slice(-3).every((d) => d.close > support);
    //   if (retracedSupport || recentCloseAboveSupport) {
    //     score.breakdown = Math.max(0, score.breakdown - 1);
    //     if (last.close > support + support * 0.002) {
    //       score.breakdown = Math.max(0, score.breakdown - 1);
    //     }
    //   }
    // }

    const breakout = score.breakout >= 4;
    const breakdown = score.breakdown >= 4;
    const decision = breakout ? "BUY" : breakdown ? "SELL" : "HOLD";

    // === Debug Logs ===
    this.dispatch("LOG", `\n=== Decision Debug based on scoring system ===`);
    this.dispatch("LOG", `Last Close: ${fixNum(last.close)}`);
    this.dispatch(
      "LOG",
      `Volume (Prev): ${fixNum(prev.volume)} (Last): ${fixNum(last.volume)} (Avg): ${fixNum(avgVolume)}`
    );
    this.dispatch("LOG", `RSI (Prev): ${prevRSI} (Last): ${currentRSI}`);
    this.dispatch("LOG", `Pattern: ${pattern}`);
    this.dispatch("LOG", `Trend: ${trend}`);
    this.dispatch("LOG", `Slope Trend: ${slopeTrend}`);
    this.dispatch("LOG", `Support: ${support} Resistance: ${resistance}`);
    this.dispatch("LOG", `Valid Support Line: ${validSupport}`);
    this.dispatch("LOG", `Valid Resistance Line: ${validResistance}`);
    this.dispatch("LOG", `Broke Resistance Line: ${brokeResistanceLine}`);
    this.dispatch("LOG", `Broke Support Line: ${brokeSupportLine}`);
    this.dispatch("LOG", `Score (breakout): ${score.breakout} (breakdown): ${score.breakdown}  `);
    this.dispatch("LOG", `Decision: ${decision}`);
    this.dispatch("LOG", `======================`);

    return decision;
  }

  logScoreTable(result) {
    console.table([
      {
        Condition: "Close > Resistance",
        Result: true,
        Weight: 2,
        Side: "Breakout",
      },
      {
        Condition: "Broke Resistance Line",
        Result: false,
        Weight: 2,
        Side: "Breakout",
      },
      {
        Condition: "Volume > Prev",
        Result: true,
        Weight: 1,
        Side: "Both",
      },
    ]);
  }

  writeLogToFile(content) {
    const logPath = path.join(process.cwd(), "trade-decisions.log");
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}]\n${content}\n\n`);
  }
}

module.exports = IntermediateTrader;
