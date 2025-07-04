import { randomUUID } from "node:crypto";
import { calculateFee } from "../services/calc-methods.js";

export default class TestExchangeProvider {
  constructor(balance, prices, interval) {
    this.currentBalance = balance;
    this.allPrices = prices;
    this.currentPriceIndex = 0;
    this.position = null;
    this.interval = interval;
    // This is custom functions only for running test.
    this.state = {
      position: null,
      trades: [],
      getBot: (pair) => ({ ...this.state }),
      updateBot: (pair, data) => Object.keys(data).forEach((k) => (this.state[k] = data[k])),
    };
  }

  async balance() {
    return this.currentBalance;
  }
  async currentPrices() {
    const price = this.allPrices[this.currentPriceIndex] || this.allPrices[this.allPrices.length - 1];
    this.currentPriceIndex += 1;
    const intervalTime = this.interval * 1000;
    if (this.position) this.position.createdAt -= intervalTime;
    return price;
  }
  async pricesData(pair, interval = 5, days = 0.5) {
    // X This method does not match Kraken Provider X
    const skip = interval / 5;
    const length = -((days * 24 * 60) / 5);
    return this.allPrices
      .map((p) => p[0])
      .slice(length)
      .filter((p, index) => index % skip === 0);
  }
  async prices(pair, limit) {
    await this.currentPrices();
    const offset = Math.max(this.currentPriceIndex - limit, 0);
    return this.allPrices.slice(offset, this.currentPriceIndex);
  }
  async createOrder(type, b, c, volume) {
    const [tradePrice, askPrice, bidPrice] = this.allPrices[this.currentPriceIndex + 1] || [];
    const newOrder = { id: randomUUID(), type, volume, createdAt: Date.now() };

    if (type == "buy") {
      newOrder.price = askPrice;
      newOrder.cost = volume * askPrice + calculateFee(volume * askPrice, 0.4);
      const remainingEurBalance = this.currentBalance.eur - newOrder.cost;
      if (parseInt(remainingEurBalance) < 0) throw new Error("No enough money");
      this.currentBalance.eur = remainingEurBalance;
      this.currentBalance.crypto += volume;
      this.position = newOrder;
      return newOrder.id;
    } else {
      const cost = volume * bidPrice;
      newOrder.price = bidPrice;
      newOrder.cost = cost - calculateFee(cost, 0.4);
      const remainingCrypto = +(this.currentBalance.crypto - volume).toFixed(8);
      if (remainingCrypto < 0) throw new Error("No enough crypto");
      this.currentBalance.eur += newOrder.cost;
      this.currentBalance.crypto = remainingCrypto;
      this.position = null;
    }
  }

  getOrders(pair, ordersIds) {
    return [this.position];
  }
}

// Examples of the pairs format from some popular exchanges:
// Kraken: Uses the slash separator (e.g., BTC/EUR, ETH/USD).
// Binance: Uses concatenated symbols without a separator (e.g., BTCEUR, ETHUSD).
// Coinbase: Typically uses a dash separator (e.g., BTC-USD, ETH-USD).
// Bitfinex: Uses concatenated symbols without a separator (e.g., tBTCUSD, tETHUSD).
