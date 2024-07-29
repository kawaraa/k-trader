// balance, currentPrice, allPrices, createOrder, getOrder

module.exports = class Kraken {
  constructor(credentials) {
    this.#apiUrl = "https://api.kraken.com";
    this.#apiKey = credentials.apiKey;
    this.#apiSecret = credentials.privateKey;
  }

  balance(path, options) {}
  currentPrice(path, data = {}) {}
  pricesData(pair, interval = 5, timestamp = "") {}
  prices(pair) {}
  createOrder(tradingType, orderType, pair, volume) {
    const order = new Order(tradingType, orderType, pair, volume);
  }
  getOrder(orderId) {}
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
