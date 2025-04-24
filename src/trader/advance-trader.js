const Trader = require("./trader");
const indicators = require("../indicators");
const services = require("../services");

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
    const ohlc = await this.ex.pricesData(this.pair, 15); // Returns 720 item (720 * 5 / 60 = 60hrs)

    const closes = ohlc.map((d) => d.close);
    this.rsi.push(indicators.calculateRSI(closes, this.rsiPeriod));
    if (this.rsi.length < 2) this.rsi.push(this.rsi[0]);
    if (this.rsi.length > 2) this.rsi.shift();

    const decision = this.decide(ohlc);
    this.decideBaseOnScore(ohlc);

    if (!positions[0] && decision === "BUY") {
      this.dispatch("LOG", `[+] Breakout detected. Placing BUY at ${currentPrice.askPrice}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      const cost = capital - calculateFee(capital, 0.3);
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
  decide(data) {
    const last = data.at(-1);
    const prev = data.at(-2);
    const currentRSI = this.rsi.at(-1);
    const prevRSI = this.rsi.at(-2);

    const { support, resistance } = services.findSupportResistance(data);
    const basic = indicators.detectBasicPattern(data);
    const advanced = indicators.detectAdvancedPattern(data);
    const trend = indicators.detectTrend(data);
    const slope = indicators.linearRegression(data.slice(-10).map((d) => d.close));
    const trendlines = indicators.detectTrendlines(data);

    const maxPivotAge = 20; // more responsive
    const recentSupportPivots = services.filterRecentTrendlines(trendlines.support, maxPivotAge, data.length);
    const recentResistancePivots = services.filterRecentTrendlines(
      trendlines.resistance,
      maxPivotAge,
      data.length
    );

    const validSupport =
      recentSupportPivots.length > 0 && services.hasStrongSlope(recentSupportPivots, "low");
    const validResistance =
      recentResistancePivots.length > 0 && services.hasStrongSlope(recentResistancePivots, "high");

    const brokeResistanceLine =
      validResistance && recentResistancePivots.some((pivot) => last.close > pivot.high);
    const brokeSupportLine = validSupport && recentSupportPivots.some((pivot) => last.close < pivot.low);

    // Average volume from last 10 bars
    const avgVolume = data.slice(-10).reduce((sum, d) => sum + d.volume, 0) / 10;

    // Expanded pattern checks
    const bullishPatterns = ["bullish-engulfing", "hammer", "piercing", "inverted-hammer"];
    const bearishPatterns = ["bearish-engulfing", "shooting-star", "dark-cloud-cover", "doji"];

    // Logs
    console.log("=== Decision Debug ===");
    console.log("Last Close:", last.close);
    console.log(
      "Prev Volume:",
      prev.volume,
      "Last Volume:",
      last.volume,
      "Avg Volume:",
      avgVolume.toFixed(2)
    );
    console.log("RSI:", currentRSI, "Prev RSI:", prevRSI);
    console.log("Pattern (basic):", basic);
    console.log("Pattern (advanced):", advanced);
    console.log("Trend:", trend);
    console.log("Slope:", slope);
    console.log("Support:", support, "Resistance:", resistance);
    console.log("Valid Support Line:", validSupport);
    console.log("Valid Resistance Line:", validResistance);
    console.log("Broke Resistance Line:", brokeResistanceLine);
    console.log("Broke Support Line:", brokeSupportLine);

    // RSI > 52 and RSI < 48: loosen further if needed
    const breakout =
      last.close > resistance &&
      brokeResistanceLine &&
      last.volume >= avgVolume &&
      currentRSI > 52 &&
      currentRSI - prevRSI > 1 &&
      (bullishPatterns.includes(basic) || advanced === "morning-star") &&
      trend === "uptrend" &&
      slope > 0;

    const breakdown =
      last.close < support &&
      brokeSupportLine &&
      last.volume >= avgVolume &&
      currentRSI < 48 &&
      prevRSI - currentRSI > 1 &&
      (bearishPatterns.includes(basic) || advanced === "evening-star") &&
      trend === "downtrend" &&
      slope < 0;

    const decision = breakout ? "BUY" : breakdown ? "SELL" : "HOLD";
    console.log("Decision:", decision);
    console.log("======================\n");

    return decision;
  }

  decideBaseOnScore(data) {
    const last = data.at(-1);
    const prev = data.at(-2);
    const currentRSI = this.rsi.at(-1);

    const { support, resistance } = services.findSupportResistance(data);
    const basic = indicators.detectBasicPattern(data);
    const advanced = indicators.detectAdvancedPattern(data);
    const trend = indicators.detectTrend(data);
    const slope = indicators.linearRegression(
      data.slice(-10).map((d) => d.close),
      false,
      0.01
    );
    const trendlines = indicators.detectTrendlines(data);

    const maxPivotAge = 30;
    const recentSupportPivots = services.filterRecentTrendlines(trendlines.support, maxPivotAge, data.length);
    const recentResistancePivots = services.filterRecentTrendlines(
      trendlines.resistance,
      maxPivotAge,
      data.length
    );

    const validSupport = services.hasStrongSlope(recentSupportPivots, "low");
    const validResistance = services.hasStrongSlope(recentResistancePivots, "high");

    const brokeResistanceLine =
      validResistance && recentResistancePivots.some((pivot) => last.close > pivot.high);
    const brokeSupportLine = validSupport && recentSupportPivots.some((pivot) => last.close < pivot.low);

    const score = {
      breakout: 0,
      breakdown: 0,
    };

    // BREAKOUT CONDITIONS
    if (last.close > resistance) score.breakout++;
    if (brokeResistanceLine) score.breakout++;
    if (last.volume > prev.volume) score.breakout++;
    if (currentRSI > 52) score.breakout++;
    if (["bullish-engulfing", "hammer", "doji"].includes(basic)) score.breakout++;
    if (advanced === "morning-star") score.breakout++;
    if (trend === "uptrend") score.breakout++;
    if (slope > 0.01) score.breakout++;

    // BREAKDOWN CONDITIONS
    if (last.close < support) score.breakdown++;
    if (brokeSupportLine) score.breakdown++;
    if (last.volume > prev.volume) score.breakdown++;
    if (currentRSI < 48) score.breakdown++;
    if (["bearish-engulfing", "shooting-star", "doji"].includes(basic)) score.breakdown++;
    if (advanced === "evening-star") score.breakdown++;
    if (trend === "downtrend") score.breakdown++;
    if (slope < -0.01) score.breakdown++;

    const breakout = score.breakout >= 5;
    const breakdown = score.breakdown >= 5;

    console.log("\n=== Decision Debug based on scoring system ===");
    console.log("Last Close:", last.close);
    console.log("Prev Volume:", prev.volume, "Last Volume:", last.volume);
    console.log("RSI:", currentRSI, "Prev RSI:", this.rsi.at(-2));
    console.log("Pattern (basic):", basic);
    console.log("Pattern (advanced):", advanced);
    console.log("Trend:", trend);
    console.log("Slope:", slope);
    console.log("Support:", support, "Resistance:", resistance);
    console.log("Valid Support Line:", validSupport);
    console.log("Valid Resistance Line:", validResistance);
    console.log("Broke Resistance Line:", brokeResistanceLine);
    console.log("Broke Support Line:", brokeSupportLine);
    console.log("Score:", score);
    console.log("Decision:", breakout ? "BUY" : breakdown ? "SELL" : "HOLD");
    console.log("======================\n");

    return breakout ? "BUY" : breakdown ? "SELL" : "HOLD";
  }

  placeTestOrder(type, volume, price, position) {
    if (type == "BUY") {
      if (!this.testMode) {
        return this.ex.createOrder("buy", "market", this.pair, volume);
      } else {
        this.positions.push({ price: price.askPrice, volume });
        this.dispatch("LOG", "Placing-BUY: " + JSON.stringify(price));
      }
    } else {
      if (!this.testMode) {
        return this.sell(position, volume, price.bidPrice);
      } else {
        let cost = this.positions[0].volume * price.bidPrice;
        cost = cost - calculateFee(cost, 0.3);
        if (cost > 0) this.profit += cost;
        else this.loss += cost;
        this.positions = [];
        this.dispatch("LOG", "Placing-SELL: " + JSON.stringify(price));
      }
    }
  }
}

module.exports = AdvanceSwingTrader;
