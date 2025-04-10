const Trader = require("./trader");
const indicators = require("../indicators");
const services = require("../services");

class GptMadeTrader extends Trader {
  constructor(exProvider, pair, interval, capital) {
    super(exProvider, pair, interval, capital);
    //
  }

  async run() {
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = await this.ex.getOrders(this.pair);
    const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.pair);
    const ohlc = await this.ex.pricesData(PAIR, INTERVAL);
    const closes = ohlc.map((d) => d.close);
    const rsi = indicators.calculateRSI(closes, RSI_PERIOD);

    const decisionSignal = this.decide(ohlc, rsi);

    if (decisionSignal === "buy") {
      this.dispatch("log", `[+] Breakout detected. Placing BUY at ${askPrice}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      const cost = capital - calculateFee(capital, 0.4);
      const investingVolume = +(cost / askPrice).toFixed(8);
      const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
      // this.dispatch("log", JSON.stringify({ tradePrice, askPrice, bidPrice }));
    } else if (decisionSignal === "sell") {
      this.dispatch("log", `[-] Breakdown detected. Placing SELL order at ${bidPrice}`);
      await this.sell(positions[0], balance.crypto, bidPrice);
      // this.dispatch("log", JSON.stringify({ tradePrice, askPrice, bidPrice }));
    } else {
      this.dispatch("log", "[=] No trade signal.");
    }
  }

  // ===== breakout breakdown based Strategy
  decide(data, rsi) {
    const last = data.at(-1);
    const prev = data.at(-2);
    const currentRSI = rsi.at(-1);

    const { support, resistance } = services.findSupportResistance(data);
    const basic = indicators.detectBasicPattern(data);
    const advanced = indicators.detectAdvancedPattern(data);
    const trend = indicators.detectTrend(data);
    const slope = indicators.linearRegression(data.slice(-10).map((d) => d.close));
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

    const breakout =
      last.close > resistance &&
      brokeResistanceLine &&
      last.volume > prev.volume &&
      currentRSI > 55 &&
      (["bullish-engulfing", "hammer"].includes(basic) || advanced === "morning-star") &&
      trend === "uptrend" &&
      slope > 0;

    const breakdown =
      last.close < support &&
      brokeSupportLine &&
      last.volume > prev.volume &&
      currentRSI < 45 &&
      (["bearish-engulfing", "shooting-star"].includes(basic) || advanced === "evening-star") &&
      trend === "downtrend" &&
      slope < 0;

    return breakout ? "buy" : breakdown ? "sell" : null;
  }
}

module.exports = GptMadeTrader;
