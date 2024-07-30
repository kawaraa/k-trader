const { randomUUID } = require("node:crypto");
const pricesOffset = 144;

module.exports = class TestExchangeProvider {
  constructor(balance, prices) {
    this.currentBalance = balance;
    this.allPrices = prices;
    this.currentPriceIndex = pricesOffset;
  }

  async balance() {
    return this.currentBalance;
  }
  async currentPrice() {
    const price = this.allPrices[this.currentPriceIndex];
    this.currentPriceIndex += 1;
    return price;
  }
  async prices() {
    return this.allPrices.slice(this.currentPriceIndex - pricesOffset, this.currentPriceIndex);
  }
  async createOrder(tradingType, b, c, amount) {
    const cost = amount * this.allPrices[this.currentPriceIndex];
    const fee = (cost * 0.4) / 100;

    this.lastOrder = {
      id: randomUUID(),
      price: this.allPrices[this.currentPriceIndex],
      volume: amount,
      cost: cost + fee,
    };

    if (tradingType == "buy") {
      if (this.currentBalance.eur < this.lastOrder.cost) throw new Error("No enough money");
      this.currentBalance.eur -= this.lastOrder.cost;
      this.currentBalance.crypto += amount;
    } else {
      if (this.currentBalance.crypto < amount) throw new Error("No enough crypto");
      this.currentBalance.eur += this.lastOrder.cost;
      this.currentBalance.crypto -= amount;
    }

    return this.lastOrder.id;
  }
  async getOrder(orderId) {
    return this.lastOrder;
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
