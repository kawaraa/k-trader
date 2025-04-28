const { randomUUID } = require("node:crypto");
const { calculateFee } = require("../services");

module.exports = class TestExchangeProvider {
  constructor(balance, prices, interval) {
    this.currentBalance = balance;
    this.allPrices = prices;
    this.currentPriceIndex = 0;
    this.orders = [];
    this.trades = [];
    this.interval = interval;
    // This is custom functions only for running test.
    this.state = {
      getBot: (pair) => ({ ...this }),
      updateBot: (pair, data) => Object.keys(data).forEach((k) => (this[k] = data[k])),
    };
  }

  async balance() {
    return this.currentBalance;
  }
  async currentPrices() {
    const price = this.allPrices[this.currentPriceIndex] || this.allPrices[this.allPrices.length - 1];
    this.currentPriceIndex += 1;
    const intervalTime = this.interval * 60000;
    this.orders.forEach((o) => (o.createdAt -= intervalTime));
    return price;
  }
  async pricesData(pair, interval = 5, days = 0.5) {
    // X This method does not match Kraken Provider X
    const skip = interval / 5;
    const length = -((days * 24 * 60) / 5);
    return this.allPrices
      .map((p) => p.tradePrice)
      .slice(length)
      .filter((p, index) => index % skip === 0);
  }
  async prices(pair, limit) {
    await this.currentPrices();
    const offset = this.currentPriceIndex - limit;
    return this.allPrices.slice(offset, this.currentPriceIndex);
  }
  async createOrder(tradingType, b, c, volume) {
    const { tradePrice, askPrice, bidPrice } = this.allPrices[this.currentPriceIndex - 1];
    const newOrder = { id: randomUUID(), type: tradingType, volume, createdAt: Date.now() };

    if (newOrder.type == "buy") {
      const cost = volume * askPrice;
      newOrder.price = askPrice;
      newOrder.cost = cost + calculateFee(cost, 0.3);

      const remainingBalance = this.currentBalance.eur - newOrder.cost;
      if (remainingBalance < 0) throw new Error("No enough money");
      this.currentBalance.eur = remainingBalance;
      this.currentBalance.crypto += volume;
      this.orders.push(newOrder);
    } else {
      const cost = volume * bidPrice;
      newOrder.price = bidPrice;
      newOrder.cost = cost - calculateFee(cost, 0.3);
      const remainingCrypto = +(this.currentBalance.crypto - volume).toFixed(8);
      if (remainingCrypto < 0) throw new Error("No enough crypto");
      this.currentBalance.eur += newOrder.cost;
      this.currentBalance.crypto = remainingCrypto;
    }

    return newOrder.id;
  }
  async getOrders(pair, ordersIds) {
    if (!ordersIds) return this.orders;
    return this.orders.filter((o) => ordersIds.includes(o.id));
  }
};

// Examples of the pairs format from some popular exchanges:
// Kraken: Uses the slash separator (e.g., BTC/EUR, ETH/USD).
// Binance: Uses concatenated symbols without a separator (e.g., BTCEUR, ETHUSD).
// Coinbase: Typically uses a dash separator (e.g., BTC-USD, ETH-USD).
// Bitfinex: Uses concatenated symbols without a separator (e.g., tBTCUSD, tETHUSD).
