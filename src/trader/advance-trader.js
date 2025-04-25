const Trader = require("./trader");
const indicators = require("../indicators");
const services = require("../services");
const fixNum = (n) => +n.toFixed(2);

class AdvanceSwingTrader extends Trader {
  constructor(exProvider, pair, interval, capital, testMode) {
    super(exProvider, pair, interval, capital);
    this.testMode = testMode;
    this.positions = [];
    this.profit = 0;
    this.loss = 0;
    this.rsi = [];
  }

  async run() {
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = this.testMode ? this.positions : await this.ex.getOrders(this.pair);
    const currentPrice = await this.ex.currentPrices(this.pair); // { tradePrice, askPrice, bidPrice }
    const ohlc = await this.ex.pricesData(this.pair, this.interval); // Returns 720 item (720 * 5 / 60 = 60hrs)

    const closes = ohlc.map((d) => d.close);
    this.rsi.push(indicators.calculateRSI(closes, this.rsiPeriod));
    if (this.rsi.length < 2) this.rsi.push(this.rsi[0]);
    if (this.rsi.length > 2) this.rsi.shift();

    // this.decide(ohlc);
    const decision = this.decideBaseOnScore(ohlc);

    if (!positions[0] && decision === "BUY") {
      this.dispatch("LOG", `[+] Breakout detected. Placing BUY at ${currentPrice.askPrice}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      const cost = capital - services.calcPercentageDifference(capital, 0.3);
      const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
      await this.placeTestOrder("BUY", investingVolume, currentPrice.askPrice);
      //
    } else if (positions[0] && decision === "SELL") {
      this.dispatch("LOG", `[-] Breakdown detected. Placing SELL order at ${bidPrice}`);
      await this.placeTestOrder("SELL", balance.crypto, currentPrice, positions[0]);
      this.placeTestOrder("SELL", this.orderVolume, currentPrice.bidPrice);
    } else {
      this.dispatch("LOG", `[=] No trade signal. decision: ${decision} order: ${this.positions[0] || "NO"}`);
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

    const shortData = data.slice(-10).map((d) => d.close);
    const slopeTrend = indicators.linearRegression(shortData, true, 1);
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

    const score = {
      breakout: 0,
      breakdown: 0,
    };

    // BREAKOUT CONDITIONS (weighted)
    if (last.close > resistance) score.breakout += 2;
    if (brokeResistanceLine) score.breakout += 2;
    if (last.volume > prev.volume) score.breakout += 1;
    if (last.volume > avgVolume * 1.2) score.breakout += 1;
    if (currentRSI > 52) score.breakout += 1;
    if (["bullish-engulfing", "hammer"].includes(basic)) score.breakout += 2;
    if (basic === "doji" && trend === "uptrend") score.breakout += 1;
    if (advanced === "morning-star") score.breakout += 2;
    if (trend === "uptrend") score.breakout += 1;
    if (slopeTrend === "uptrend") score.breakout += 1;

    // BREAKDOWN CONDITIONS (weighted)
    if (last.close < support) score.breakdown += 2;
    if (brokeSupportLine) score.breakdown += 2;
    if (last.volume > prev.volume) score.breakdown += 1;
    if (last.volume > avgVolume * 1.2) score.breakdown += 1;
    if (currentRSI < 48) score.breakdown += 1;
    if (["bearish-engulfing", "shooting-star"].includes(basic)) score.breakdown += 2;
    if (basic === "doji" && trend === "downtrend") score.breakdown += 1;
    if (advanced === "evening-star") score.breakdown += 2;
    if (trend === "downtrend") score.breakdown += 1;
    if (slopeTrend === "downtrend") score.breakdown += 1;

    const breakout = score.breakout >= 5;
    const breakdown = score.breakdown >= 5;

    // === Debug Logs ===
    console.log("\n=== Decision Debug based on scoring system ===");
    console.log("Last Close:", fixNum(last.close));
    console.log("Volume (Prev):", fixNum(prev.volume), "(Last):", fixNum(last.volume), "(Avg):", avgVolume);
    if (avgVolume < 10) console.log("⛔️ low volume");
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

  placeTestOrder(type, volume, price, position) {
    if (type == "BUY") {
      if (!this.testMode) {
        return this.ex.createOrder("buy", "market", this.pair, volume);
      } else {
        this.positions.push({ price: price.askPrice, volume });
        this.dispatch("LOG", "Placing BUY at" + JSON.stringify(price));
      }
    } else {
      if (!this.testMode) {
        return this.sell(position, volume, price.bidPrice);
      } else {
        let cost = this.positions[0].volume * price.bidPrice;
        cost = cost - services.calcPercentageDifference(cost, 0.3);
        if (cost > 0) this.profit += cost;
        else this.loss += cost;
        this.positions = [];
        this.dispatch("LOG", "Placing SELL at", JSON.stringify(price), "Profit:", this.profit);
      }
    }
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

module.exports = AdvanceSwingTrader;
