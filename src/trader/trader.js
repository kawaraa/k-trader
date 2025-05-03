const { calculateFee } = require("../services");

// Smart trader
class Trader {
  constructor(exProvider, pair, interval, capital, mode) {
    this.ex = exProvider;
    this.pair = pair;
    this.interval = +interval;
    this.capital = +capital; // Investment cptl investing Amount in ERU that will be used every time to by crypto
    // this.strategyTimestamp = info.strategyTimestamp;
    this.period = +interval; // this.period is deleted in only test trading
    // this.testMode = info.testMode;
    this.testMode = mode != "live";
    this.rsiPeriod = 14; // Recommended Default is 14
    this.listener = null; // Should be a function
    this.timeoutID = 0;

    // this.strategyRange = +range; // Range in hours "0.5 = have an hour"
    // this.pricePercentChange = +pricePercent; // Percentage Change is the price Percentage Threshold
    // this.halfPercent = this.pricePercentChange / 2;
    // this.thirdPercent = this.pricePercentChange / 3;
    // this.buySellOnPercent = this.pricePercentChange / 5;
  }

  async start() {
    try {
      if (this.run) await this.run();
    } catch (error) {
      this.dispatch("LOG", `Error running bot: ${error}`);
    }
    if (this.period) this.timeoutID = setTimeout(() => this.start(), 60000 * this.period);
  }

  async run() {} // This is overwritten in derived classes

  // await this.buy(this.capital, balance, currentPrice.askPrice);
  async buy(balance, price) {
    const capital = balance.eur < this.capital ? balance.eur : this.capital;
    const cost = capital - calculateFee(capital, 0.3);
    const cryptoVolume = +(cost / price).toFixed(8);
    let position = null;

    if (!this.testMode) position = await this.ex.createOrder("buy", "market", this.pair, cryptoVolume);
    else this.position = { price, volume: cryptoVolume, cost, createdAt: Date.now() };

    this.ex.state.updateBot(this.pair, { position: position });
  }

  async sell(oldOrder, balance, price) {
    const { trades } = this.ex.state.getBot(this.pair);
    const orderAge = ((Date.now() - oldOrder.createdAt) / 60000 / 60).toFixed(1);
    const volume = balance.crypto - oldOrder.volume < 5 ? balance.crypto : oldOrder.volume;
    const cost = volume * price;
    const profit = cost - calculateFee(cost, 0.3) - oldOrder.cost;

    if (!this.testMode) await this.ex.createOrder("sell", "market", this.pair, volume);
    else this.position = null;

    trades.push(profit);
    this.ex.state.updateBot(this.pair, { trades, position: null });
    this.dispatch("SELL");
    return { profit, age: orderAge };
  }

  async sellAll() {
    const cryptoBalance = (await this.ex.balance(this.pair)).crypto;
    if (cryptoBalance > 0) {
      const { trades, position } = this.ex.state.getBot(this.pair);
      const bidPrice = (await this.ex.currentPrices(this.pair)).bidPrice;
      await this.ex.createOrder("sell", "market", this.pair, cryptoBalance);
      const cost = bidPrice * cryptoBalance - calculateFee(bidPrice * cryptoBalance, 0.3);
      const profit = (cost - calculateFee(cost, 0.3) - (position?.cost || cost)).toFixed(2);
      trades.push(profit);
      this.ex.state.updateBot(this.pair, { trades });
      this.dispatch("LOG", `Placed SELL - profit/loss: ${profit} `);
    }
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.pair + "", event, info);
  }
}

module.exports = Trader;
