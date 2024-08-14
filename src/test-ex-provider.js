const { randomUUID } = require("node:crypto");
const { calculateFee } = require("./trend-analysis");

module.exports = class TestExchangeProvider {
  constructor(balance, prices, priceIndex) {
    this.currentBalance = balance;
    this.allPrices = prices;
    this.currentPriceIndex = priceIndex;
    this.orders = [];
    this.stateOrders = [];
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
  async createOrder(tradingType, ordertype, pair, volume, price) {
    const cost = volume * this.allPrices[this.currentPriceIndex];
    const fee = calculateFee(cost, 0.4);

    const newOrder = {
      id: randomUUID(),
      price: this.allPrices[this.currentPriceIndex],
      volume,
      cost: cost + fee,
      status: "closed",
    };

    if (tradingType == "buy") {
      const remainingBalance = this.currentBalance.eur - newOrder.cost;
      if (remainingBalance < 0) throw new Error("No enough money");
      this.currentBalance.eur = remainingBalance;
      this.currentBalance.crypto += volume;
    } else {
      const remainingCrypto = +(this.currentBalance.crypto - volume).toFixed(8);
      if (remainingCrypto < 0) throw new Error("No enough crypto");
      this.currentBalance.eur += newOrder.cost - fee * 2;
      this.currentBalance.crypto = remainingCrypto;
    }

    this.orders.push(newOrder);

    return newOrder.id;
  }
  async cancelOrder(id) {
    this.removeOrderId(id);
    return true;
  }
  async getOrders(pair, ordersIds) {
    let orders = this.orders;
    if (ordersIds) orders = this.orders.filter((o) => ordersIds.includes(o.id));
    return { stateOrders: this.stateOrders, orders };
  }

  // The following custom function only for running test and mocking the state.
  addOrderId(orderIds) {
    const [buyId, sellId] = orderIds.split("::");
    const index = this.stateOrders.findIndex((o) => o.includes(buyId));
    if (index > -1) this.stateOrders[index] = orderIds;
    else this.stateOrders.push(orderIds);
  }
  removeOrderId(orderId) {
    const [buyId, sellId] = orderId.split("::");
    this.stateOrders = this.stateOrders.filter((o) => !o.includes(buyId));
    this.orders = this.orders.filter((o) => !orderId.includes(o.id));
  }
};

// Examples of the pairs format from some popular exchanges:
// Kraken: Uses the slash separator (e.g., BTC/EUR, ETH/USD).
// Binance: Uses concatenated symbols without a separator (e.g., BTCEUR, ETHUSD).
// Coinbase: Typically uses a dash separator (e.g., BTC-USD, ETH-USD).
// Bitfinex: Uses concatenated symbols without a separator (e.g., tBTCUSD, tETHUSD).
