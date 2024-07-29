const { randomUUID } = require("node:crypto");

module.exports = class TestExchangeProvider {
  constructor(balance, prices, oscillatorOffset) {
    this.currentBalance = balance;
    this.allPrices = prices;
    this.currentPriceIndex = oscillatorOffset;
    this.oscillatorOffset = oscillatorOffset;
  }

  balance() {
    return this.currentBalance;
  }
  currentPrice() {
    this.currentPriceIndex += 1;
    return this.allPrices[this.currentPriceIndex];
  }
  prices() {
    return this.allPrices.slice(
      this.currentPriceIndex - Math.min(144, this.oscillatorOffset),
      this.currentPriceIndex
    );
  }
  createOrder(tradingType, b, c, amount) {
    const cost = amount / this.allPrices[this.currentPriceIndex];
    const fee = (cost * 0.4) / 100;
    this.lastOrder = {
      id: randomUUID(),
      price: this.currentBalance[this.currentPriceIndex],
      volume: amount,
      cost: cost + fee,
    };

    if (tradingType == "buy") {
      this.currentBalance.eur -= this.lastOrder.cost;
      this.currentBalance.crypto += amount;
    } else {
      this.currentBalance.eur += this.lastOrder.cost;
      this.currentBalance.crypto -= amount;
    }

    return this.lastOrder.id;
  }
  getOrder(orderId) {
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
