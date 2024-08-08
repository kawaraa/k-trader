const { randomUUID } = require("node:crypto");
const { calculateFee } = require("./trend-analysis");

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
    const fee = calculateFee(cost, 0.4);

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
      this.orders.push(newOrder);
    } else {
      const remainingCrypto = +(this.currentBalance.crypto - amount).toFixed(8);
      if (remainingCrypto < 0) throw new Error("No enough crypto");
      this.currentBalance.eur += newOrder.cost - fee * 2;
      this.currentBalance.crypto = remainingCrypto;
    }

    return newOrder.id;
  }
  async getOrders(pair, ordersIds) {
    if (!ordersIds) return this.orders;
    return this.orders.filter((o) => ordersIds.includes(o.id));
  }

  // This is custom function only for running test.
  removeOrder(orderId) {
    this.orders = this.orders.filter((o) => o.id !== orderId);
  }
};

// Examples of the pairs format from some popular exchanges:
// Kraken: Uses the slash separator (e.g., BTC/EUR, ETH/USD).
// Binance: Uses concatenated symbols without a separator (e.g., BTCEUR, ETHUSD).
// Coinbase: Typically uses a dash separator (e.g., BTC-USD, ETH-USD).
// Bitfinex: Uses concatenated symbols without a separator (e.g., tBTCUSD, tETHUSD).
