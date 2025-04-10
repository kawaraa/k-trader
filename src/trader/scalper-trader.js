const Trader = require("./trader");
const { findPriceMovement } = require("../indicators.js");
const { calcPercentageDifference, calcAveragePrice, calculateFee } = require("../services.js");

// Smart trader
class ScalpingTrader extends Trader {
  constructor(exProvider, pair, interval, capital, profitTarget, stopLoss) {
    super(exProvider, pair, interval, capital);
    this.profitTarget = +profitTarget;
    this.stopLoss = +stopLoss;
    this.listener = null;
    this.breakdowns = [1];
  }

  async run() {
    // Get data from Kraken
    const balance = await this.ex.balance(this.pair); // Get current balance in EUR and the "pair"
    const { tradePrice, askPrice, bidPrice } = await this.ex.currentPrices(this.pair);
    const prices = await this.ex.prices(this.pair, 2); // For the last 2 hours
    const orders = await this.ex.getOrders(this.pair);

    const enoughPricesData = prices.length >= (2 * 60 * 60) / this.interval;
    // const targetSellPrice = bidPrice * (1 + profitTarget / 100);
    // const stopLossPrice = bidPrice * (1 - stopLoss / 100);

    if (enoughPricesData) {
      const averageAskBidSpread = calcAveragePrice(
        prices.map((p) => calcPercentageDifference(p.bidPrice, p.askPrice))
      );
      const askBidSpreadPercentage = calcPercentageDifference(bidPrice, askPrice);
      const safeAskBidSpread = askBidSpreadPercentage <= averageAskBidSpread;

      if (!orders[0] && this.capital > 0 && balance.eur >= this.capital / 2) {
        const highestBidPr = (prices.map((p) => p.bidPrice) || []).toSorted().at(-1);
        this.breakdowns.push(Math.max(-calcPercentageDifference(highestBidPr, bidPrice), 1));
        if (this.breakdowns.length > 10) this.breakdowns.shift();

        const shouldBuy =
          safeAskBidSpread &&
          this.breakdowns.at(-1) * 1.1 > this.breakdowns.at(-2) &&
          findPriceMovement(prices, this.breakdowns.at(-1) / 5) == "INCREASING";
        // Todo: try mountains signal

        if (shouldBuy) {
          const capital = balance.eur < this.capital ? balance.eur : this.capital;
          const cost = capital - calculateFee(capital, 0.4);
          const investingVolume = +(cost / askPrice).toFixed(8);
          const orderId = await this.ex.createOrder("buy", "market", this.pair, investingVolume);
          this.dispatch("buy", orderId);
          this.dispatch("log", `Placing BUY at ${askPrice}`);
        }
      } else if (orders[0] && balance.crypto > 0) {
        const orderPriceChange = calcPercentageDifference(orders[0].price, bidPrice);
        const profitAndStoLossLimit = Math.max(1, this.breakdowns.at(-1) / 1.5);

        if (orderPriceChange >= profitAndStoLossLimit) {
          await this.sell(orders[0], balance.crypto, bidPrice);
          this.dispatch("log", `Target reached. sold at ${bidPrice}`);
        } else if (safeAskBidSpread && orderPriceChange + averageAskBidSpread < -profitAndStoLossLimit) {
          await this.sell(orders[0], balance.crypto, bidPrice);
          this.dispatch("log", `Stop loss hit. sold at ${bidPrice}`);
        } else {
          this.dispatch("log", `Monitoring for ${profitAndStoLossLimit}% profit or stop loss`);
        }
      }

      this.dispatch("log", "");
    }
  }
}

module.exports = ScalpingTrader;
