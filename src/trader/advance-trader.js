const Trader = require("./trader");
const indicators = require("../indicators");
const services = require("../services");
const fixNum = (n) => +n.toFixed(2);

class AdvanceTrader extends Trader {
  constructor(exProvider, pair, interval, capital, mode) {
    super(exProvider, pair, interval, capital, mode);
    this.position = null;
    this.profit = 0;
    this.loss = 0;
    this.rsi = [];
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
    const log = this.testMode ? "TEST:" : "";

    if (!position && decision === "BUY") {
      this.dispatch("LOG", ` ${log} [+] Breakout detected. Placing BUY at ${currentPrice.askPrice}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      await this.placeOrder("BUY", capital, currentPrice.askPrice);
      //
    } else if (position && decision === "SELL") {
      this.dispatch("LOG", ` ${log} [-] Breakdown detected. Placing SELL at ${currentPrice.bidPrice}`);
      await this.placeOrder("SELL", balance.crypto, currentPrice.bidPrice, position);
    } else {
      this.dispatch("LOG", ` ${log} [=] No trade signal.decision: ${decision} position: ${position ? 1 : 0}`);
    }
  }

  // ===== breakout breakdown based Strategy
  decideBaseOnScore(data) {
    const currentRSI = this.rsi.at(-1);
    const prevRSI = this.rsi.at(-2);
    const last = data.at(-1);
    const prev = data.at(-2);
    const period = parseInt((10 * 60) / this.interval);
    const avgVolume = fixNum(data.slice(-period).reduce((sum, d) => sum + d.volume, 0) / period);

    const { support, resistance } = services.findSupportResistance(data.slice(-20));
    const basic = indicators.detectBasicPattern(data);
    const advanced = indicators.detectAdvancedPattern(data);
    const trend = indicators.detectTrend(data.slice(-30));

    const shortData = data.slice(-15).map((d) => d.close); // Slightly longer for better slope
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

    const score = { breakout: 0, breakdown: 0 };

    // BREAKOUT CONDITIONS
    if (last.close > resistance) score.breakout += 2;
    if (brokeResistanceLine) score.breakout += 2;
    if (avgVolume >= 10 && last.volume > prev.volume && last.volume > avgVolume * 1.3) score.breakout += 1;
    if (currentRSI > 52 && currentRSI - prevRSI > 2) score.breakout += 1;
    if (currentRSI > 55 && currentRSI - prevRSI > 5) score.breakout += 1; // breakdown momentum
    if (["bullish-engulfing", "hammer"].includes(basic)) score.breakout += 2;
    if (basic === "doji" && trend === "uptrend") score.breakout += 1;
    if (advanced === "morning-star") score.breakout += 2;
    if (trend === "uptrend") score.breakout += 1;
    if (slopeTrend === "uptrend") score.breakout += 1;
    const closes = data.slice(-4).map((d) => d.close);
    const trendingUp = closes.every((v, i, arr) => i === 0 || v >= arr[i - 1]);
    if (trendingUp) score.breakout += 1;

    // BREAKDOWN CONDITIONS
    if (last.close < support) score.breakdown += 2;
    if (brokeSupportLine) score.breakdown += 2;
    if (avgVolume >= 10 && last.volume > prev.volume && last.volume > avgVolume * 1.3) score.breakdown += 1;
    if (currentRSI < 48 && prevRSI - currentRSI > 2) score.breakdown += 1;
    if (currentRSI < 45 && prevRSI - currentRSI > 5) score.breakdown += 1; // breakdown momentum
    if (["bearish-engulfing", "shooting-star", "dark-cloud-cover"].includes(basic)) score.breakdown += 2;
    if (basic === "doji" && trend === "downtrend") score.breakdown += 1;
    if (advanced === "evening-star") score.breakdown += 2;
    if (trend === "downtrend") score.breakdown += 1;
    if (slopeTrend === "downtrend") score.breakdown += 1;
    const closesDown = data.slice(-4).map((d) => d.close);
    const trendingDown = closesDown.every((v, i, arr) => i === 0 || v <= arr[i - 1]);
    if (trendingDown) score.breakdown += 1;

    // === FAKEOUT PROTECTION ===
    // If resistance line broke but retraced or volume is low, lower breakout score
    if (brokeResistanceLine) {
      const retracedResistance = last.close < resistance && prev.close < resistance;
      const recentCloseBelowResistance = data.slice(-3).every((d) => d.close < resistance);
      if (retracedResistance || (recentCloseBelowResistance && last.volume < avgVolume)) {
        score.breakout = Math.max(0, score.breakout - 2);
      }
      if (retracedResistance && last.close < resistance - resistance * 0.002) {
        score.breakout = Math.max(0, score.breakout - 1);
      }
    }

    // If support line broke but retraced, lower breakdown score
    if (brokeSupportLine) {
      const retracedSupport = last.close > support && prev.close > support;
      const recentCloseAboveSupport = data.slice(-3).every((d) => d.close > support);

      if (retracedSupport || recentCloseAboveSupport) {
        score.breakdown = Math.max(0, score.breakdown - 2);
        if (last.close > support + support * 0.002) {
          score.breakdown = Math.max(0, score.breakdown - 1);
        }
      }
    }

    const breakout = score.breakout >= 5;
    const breakdown = score.breakdown >= 5;

    // === Debug Logs ===
    console.log("\n=== Decision Debug based on scoring system ===");
    console.log("Last Close:", fixNum(last.close));
    console.log("Volume (Prev):", fixNum(prev.volume), "(Last):", fixNum(last.volume), "(Avg):", avgVolume);
    console.log("RSI (Prev):", prevRSI, "(Last):", currentRSI);
    console.log("Pattern (basic):", basic, "(advanced):", advanced);
    console.log("Trend:", trend);
    console.log("Slope Trend:", slopeTrend);
    console.log("Support:", support, "Resistance:", resistance);
    console.log("Valid Support Line:", validSupport);
    console.log("Valid Resistance Line:", validResistance);
    console.log("Broke Resistance Line:", brokeResistanceLine);
    console.log("Broke Support Line:", brokeSupportLine);
    console.log("Score:", score);
    console.log("Decision:", breakout ? "BUY" : breakdown ? "SELL" : "HOLD");
    console.log("======================");

    return breakout ? "BUY" : breakdown ? "SELL" : "HOLD";
  }

  logScoreTable(result) {
    console.table([
      {
        Condition: "Close > Resistance",
        Result: last.close > resistance,
        Weight: 2,
        Side: "Breakout",
      },
      {
        Condition: "Broke Resistance Line",
        Result: brokeResistanceLine,
        Weight: 2,
        Side: "Breakout",
      },
      {
        Condition: "Volume > Prev",
        Result: last.volume > prev.volume,
        Weight: 1,
        Side: "Both",
      },
      {
        Condition: "Volume > Avg * 1.2",
        Result: last.volume > avgVolume * 1.2,
        Weight: 1,
        Side: "Both",
      },
      {
        Condition: "RSI > 52",
        Result: currentRSI > 52,
        Weight: 1,
        Side: "Breakout",
      },
      {
        Condition: "RSI < 48",
        Result: currentRSI < 48,
        Weight: 1,
        Side: "Breakdown",
      },
      {
        Condition: "Pattern (bullish)",
        Result: ["bullish-engulfing", "hammer"].includes(basic),
        Weight: 2,
        Side: "Breakout",
      },
      {
        Condition: "Pattern (bearish)",
        Result: ["bearish-engulfing", "shooting-star"].includes(basic),
        Weight: 2,
        Side: "Breakdown",
      },
      {
        Condition: "Doji + Uptrend",
        Result: basic === "doji" && trend === "uptrend",
        Weight: 1,
        Side: "Breakout",
      },
      {
        Condition: "Doji + Downtrend",
        Result: basic === "doji" && trend === "downtrend",
        Weight: 1,
        Side: "Breakdown",
      },
      {
        Condition: "Advanced: Morning Star",
        Result: advanced === "morning-star",
        Weight: 2,
        Side: "Breakout",
      },
      {
        Condition: "Advanced: Evening Star",
        Result: advanced === "evening-star",
        Weight: 2,
        Side: "Breakdown",
      },
      {
        Condition: "Trend == uptrend",
        Result: trend === "uptrend",
        Weight: 1,
        Side: "Breakout",
      },
      {
        Condition: "Trend == downtrend",
        Result: trend === "downtrend",
        Weight: 1,
        Side: "Breakdown",
      },
      {
        Condition: "Slope > Threshold",
        Result: slope > dynamicSlopeThreshold,
        Weight: 1,
        Side: "Breakout",
      },
      {
        Condition: "Slope < -Threshold",
        Result: slope < -dynamicSlopeThreshold,
        Weight: 1,
        Side: "Breakdown",
      },
    ]);
  }

  writeLogToFile(content) {
    const logPath = path.join(process.cwd(), "trade-decisions.log");
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}]\n${content}\n\n`);
  }
}

module.exports = AdvanceTrader;
