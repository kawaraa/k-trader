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

  placeOrder(type, cryptoOrEurBalance, price, position) {
    if (type == "BUY") {
      const cost = cryptoOrEurBalance - calculateFee(cryptoOrEurBalance, 0.3);
      const investingCryptoVolume = +(cost / price).toFixed(8);

      if (!this.testMode) return this.buy(investingCryptoVolume, price);
      else this.position = { price, volume: investingCryptoVolume };

      //
    } else if (type == "SELL") {
      const volume =
        price * (cryptoOrEurBalance - position.volume) < 5 ? cryptoOrEurBalance : position.volume;

      if (!this.testMode) return this.sell(position, volume, price);
      else {
        let cost = volume * price;
        cost = cost - calculateFee(cost, 0.3);
        if (cost > 0) this.profit += cost;
        else this.loss += cost;
        this.position = null;
        this.dispatch("LOG", `Sold at: ${price} - Gain: ${this.profit} - Loss: ${this.loss}`);
      }
    }
  }

  async buy(volume, price) {
    this.dispatch("LOG", `Placing BUY at: ${price}`);
    const orderId = await this.ex.createOrder("buy", "market", this.pair, volume);
    this.dispatch("BUY", orderId);
  }

  async sell({ id, cost, createdAt }, volume, price) {
    this.dispatch("LOG", `Placing SELL at ${price}`);
    const orderId = await this.ex.createOrder("sell", "market", this.pair, volume);
    const c = price * volume - calculateFee(price * volume, 0.3);
    const profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - cost).toFixed(2);
    const orderAge = ((Date.now() - createdAt) / 60000 / 60).toFixed(1);
    this.dispatch("SELL", { id, profit });
    this.dispatch("LOG", `Sold with profit/loss: ${profit} - Hold position: ${orderAge}hrs`);
  }

  async sellAll() {
    const cryptoBalance = (await this.ex.balance(this.pair)).crypto;
    let profit = 0;
    if (cryptoBalance > 0) {
      const orders = await this.ex.getOrders(this.pair);
      const bidPrice = (await this.ex.currentPrices(this.pair)).bidPrice;
      const orderId = await this.ex.createOrder("sell", "market", this.pair, cryptoBalance);
      const c = bidPrice * cryptoBalance - calculateFee(bidPrice * cryptoBalance, 0.3);
      const ordersCost = orders.reduce((totalCost, { cost }) => totalCost + cost, 0);
      profit = +(((await this.ex.getOrders(null, orderId))[0]?.cost || c) - ordersCost).toFixed(2);
    }
    this.dispatch("SELL", { profit });
    this.dispatch("LOG", `Sold all crypto asset with profit: ${profit}`);
  }

  stop() {
    clearTimeout(this.timeoutID);
  }

  dispatch(event, info) {
    if (this.listener) this.listener(this.pair + "", event, info);
  }
}

module.exports = Trader;
