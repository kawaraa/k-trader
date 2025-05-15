import { calcPercentageDifference } from "../services.js";
import Trader from "./trader.js";
import { EMA } from "technicalindicators";

// Smart trader
export default class GPTrader extends Trader {
  constructor(exProvider, pair, interval, capital, profitTarget, stopLoss) {
    this.supper(exProvider, pair, interval, capital);
    this.profitTarget = +profitTarget;
    this.stopLoss = +stopLoss;
    this.listener = null;
    this.previousDropPercent = 0;
  }

  async start() {
    // Get data from Kraken
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.pair);
    const prices = (await this.ex.pricesData(this.pair, 60, 200 / 24)).map((d) => d.close);
    const positions = await this.ex.getOrders(this.pair);

    const enoughPricesData = prices.length >= 200;

    if (enoughPricesData) {
      //

      const ema50 = EMA.calculate({ period: 50, values: prices });
      const ema200 = EMA.calculate({ period: 200, values: prices });
      const decisionSignal = this.decide(ema50, ema200);
      // saveSignal({ action: signal, price: askPrice });

      console.log(`signal: ${decisionSignal} - prices ${prices.length}`);
      this.dispatch(
        "log",
        `€${balance.eur.toFixed(2)} - Trade: ${tradePrice} Ask: ${askPrice} Bid: ${bidPrice}`
      );

      if (!positions[0] && this.capital > 0 && balance.eur >= this.capital / 2) {
        if (decisionSignal === "BUY") {
          const capital = balance.eur < this.capital ? balance.eur : this.capital;
          const cost = capital - calculateFee(capital, 0.4);
          const investingVolume = +(cost / askPrice).toFixed(8);
          const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
          this.dispatch("BUY", orderId);
          this.dispatch("LOG", `[${new Date().toISOString()}] Placing BUY at ${askPrice}`);
        }
      } else if (positions[0]) {
        if (decisionSignal === "SELL") {
          this.dispatch("LOG", `[${new Date().toISOString()}] Placing SELL at ${askPrice}`);
        } else {
          const priceChangePercent = calcPercentageDifference(positions[0].price, bidPrice); // 0.01 = 1%
          const profitAndStopLossPercent = getDynamicTakeProfitPct(prices);
          // console.log(profitAndStopLossPercent); // Todo: check the value
          // const shouldTakeProfit = bidPrice >= positions[0].price * (1 + profitAndStopLossPercent);

          if (priceChangePercent >= profitAndStopLossPercent * 100) {
            this.dispatch("LOG", `[${new Date().toISOString()}] Placing TAKE PROFIT at ${bidPrice}`);
            await this.sell(positions[0], balance.crypto, bidPrice);
          } else if (priceChangePercent <= -((profitAndStopLossPercent * 100) / 2)) {
            this.dispatch("LOG", `[${new Date().toISOString()}] STOP LOSS at ${bidPrice}`);
            await this.sell(positions[0], balance.crypto, bidPrice);
          }
        }
      }

      this.dispatch("LOG", "");
    }
  }

  decide(ema50, ema200) {
    const len = Math.min(ema50.length, ema200.length);
    const diff = ema50.length - ema200.length;

    const prev50 = ema50[len - 2 + diff];
    const curr50 = ema50[len - 1 + diff];
    const prev200 = ema200[len - 2];
    const curr200 = ema200[len - 1];

    if (prev50 < prev200 && curr50 > curr200) return "BUY";
    if (prev50 > prev200 && curr50 < curr200) return "SELL";
    return "HOLD";
  }
}
