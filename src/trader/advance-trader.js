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
  }

  async run() {
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const positions = this.testMode ? this.positions : await this.ex.getOrders(this.pair);
    const currentPrice = await this.ex.currentPrices(this.pair); // { tradePrice, askPrice, bidPrice }
    const ohlc = await this.ex.pricesData(this.pair, this.interval);

    const closes = ohlc.map((d) => d.close);
    const rsi = indicators.calculateRSI(closes, this.rsiPeriod);
    const decision = this.decide(ohlc, rsi);

    if (!positions[0] && decision === "BUY") {
      this.dispatch("LOG", `[+] Breakout detected. Placing BUY at ${currentPrice.askPrice}`);
      const capital = balance.eur < this.capital ? balance.eur : this.capital;
      const cost = capital - calculateFee(capital, 0.4);
      const investingVolume = +(cost / currentPrice.askPrice).toFixed(8);
      await this.placeTestOrder("BUY", investingVolume, currentPrice.askPrice);
      //
    } else if (positions[0] && decision === "SELL") {
      this.dispatch("LOG", `[-] Breakdown detected. Placing SELL order at ${bidPrice}`);
      await this.placeTestOrder("SELL", balance.crypto, currentPrice, positions[0]);
      this.placeTestOrder("SELL", this.orderVolume, currentPrice.bidPrice);
    } else {
      this.dispatch("LOG", `[=] No trade signal. decision: ${decision} order: ${this.orderPrice}`);
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
        cost = cost - calculateFee(cost, 0.4);
        if (cost > 0) this.profit += cost;
        else this.loss += cost;
        this.positions = [];
        this.dispatch("LOG", "Placing-SELL: " + JSON.stringify(price));
      }
    }
  }
}

module.exports = AdvanceSwingTrader;
