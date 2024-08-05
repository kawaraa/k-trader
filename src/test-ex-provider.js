const { randomUUID } = require("node:crypto");

module.exports = class TestExchangeProvider {
  constructor(balance, prices, priceIndex) {
    this.currentBalance = balance;
    this.allPrices = prices;
    this.currentPriceIndex = priceIndex;
    this.orders = [];
  }

  async balance() {
    return this.currentBalance;
  }
  async currentPrice() {
    const price = this.allPrices[this.currentPriceIndex];
    this.currentPriceIndex += 1;
    return price;
  }
  async prices(pair, lastDays) {
    return this.allPrices.slice(this.currentPriceIndex - (lastDays * 24 * 60) / 5, this.currentPriceIndex);
  }
  async createOrder(tradingType, b, c, amount) {
    const cost = amount * this.allPrices[this.currentPriceIndex];
    const fee = (cost * 0.4) / 100;

    const newOrder = {
      id: randomUUID(),
      price: this.allPrices[this.currentPriceIndex],
      volume: amount,
      cost: cost + fee,
    };

    if (tradingType == "buy") {
      const remainingBalance = this.currentBalance.eur - newOrder.cost;
      if (remainingBalance < 0) throw new Error("No enough money");
      this.currentBalance.eur = remainingBalance;
      this.currentBalance.crypto += amount;
    } else {
      const remainingCrypto = +(this.currentBalance.crypto - amount).toFixed(8);
      if (remainingCrypto < 0) throw new Error("No enough crypto");
      this.currentBalance.eur += newOrder.cost - fee * 2;
      this.currentBalance.crypto = remainingCrypto;
    }
    this.orders.push(newOrder);
    return newOrder.id;
  }
  async getOrders(ordersIds) {
    return this.orders.filter((o) => ordersIds.includes(o.id));
  }
};

class Order {
  constructor(tradingType, orderType, pair, volume) {
    this.tradingType = tradingType;
    this.orderType = orderType;
    this.pair = pair;
    this.volume = volume + "";
  }
}

// Examples of the pairs format from some popular exchanges:
// Kraken: Uses the slash separator (e.g., BTC/EUR, ETH/USD).
// Binance: Uses concatenated symbols without a separator (e.g., BTCEUR, ETHUSD).
// Coinbase: Typically uses a dash separator (e.g., BTC-USD, ETH-USD).
// Bitfinex: Uses concatenated symbols without a separator (e.g., tBTCUSD, tETHUSD).
