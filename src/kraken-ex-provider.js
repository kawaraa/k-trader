const { createHash, createHmac } = require("node:crypto");
const { parseNumbers, delay } = require("./utilities.js");
const TradingState = require("./trading-state.js");

module.exports = class KrakenExchangeProvider {
  #apiUrl;
  #apiKey;
  #apiSecret;

  constructor(credentials) {
    this.#apiUrl = "https://api.kraken.com";
    this.#apiKey = credentials.apiKey;
    this.#apiSecret = credentials.privateKey;
    this.state = new TradingState(`${process.cwd()}/database/`);
  }
  // Helper function to generate API signature
  #getSignature(urlPath, data) {
    if (typeof data != "object") throw new Error("Invalid data type");
    const secret_buffer = Buffer.from(this.#apiSecret, "base64");
    const hash = createHash("sha256");
    const hmac = createHmac("sha512", secret_buffer);
    const hash_digest = hash.update(data.nonce + JSON.stringify(data)).digest("binary");
    const signature = hmac.update(urlPath + hash_digest, "binary").digest("base64");
    return signature;
  }
  #checkError(res) {
    if (!res.error[0]) return res.result;
    else throw new Error(res.error.reduce((acc, err) => acc + "\n" + err, ""));
  }
  // Function to make calls to private API
  #privateApi(path, data = {}) {
    path = `/0/private/${path}`;
    data.nonce = Date.now() * 1000;
    const body = JSON.stringify(data);

    return fetch(`${this.#apiUrl}${path}`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "API-Key": this.#apiKey,
        "API-Sign": this.#getSignature(path, data),
      },
      method: "POST",
      body,
    })
      .then((res) => res.json())
      .then(this.#checkError);
  }
  // Function to make calls to public API
  publicApi(path, options) {
    return fetch(`${this.#apiUrl}/0/public${path}`, options)
      .then((res) => res.json())
      .then(this.#checkError);
  }

  async balance(pair) {
    const curMap = { BTC: "XXBT", ETH: "XETH", SOL: "SOL" };
    const key = pair.replace("EUR", "");
    const balance = parseNumbers(await this.#privateApi("Balance"));
    if (pair == "all") return balance;
    return { eur: +balance.ZEUR, crypto: +(balance[curMap[key]] || balance[key] || 0) };
  }
  async currentPrice(pair) {
    const data = await this.publicApi(`/Ticker?pair=${pair}`);
    return parseFloat(data[Object.keys(data)[0]].c[0]);
  }
  async pricesData(pair, lastDays = 0.5, interval = 5) {
    let allPrices = [];
    let timestamp = "";

    while (lastDays > (allPrices.length * 5) / 60 / 24) {
      const data = await this.publicApi(`/OHLC?pair=${pair}&interval=${interval}&since=${timestamp}`);
      allPrices = data[Object.keys(data)[0]].concat(allPrices);
      timestamp = allPrices[0][0]; // The oldest timestamp in the retrieved data
      await delay(5000);
    }
    return allPrices.slice(-((lastDays * 24 * 60) / 5));
    // "OHLC Data" stands for Open, High, Low, Close data, which represents the prices at which an asset opens, reaches its highest, reaches its lowest, and closes during a specific time interval.
  }
  async prices(pair, lastDays) {
    const prices = await this.pricesData(pair, lastDays);
    prices.pop();
    return prices.map((candle) => parseFloat(candle[4])); // candle[4] is the Closing prices
  }
  async createOrder(type, ordertype, pair, volume, oldOrderId) {
    volume += "";
    const orderId = (await this.#privateApi("AddOrder", { type, ordertype, pair, volume })).txid[0];
    this.state.addOrder(pair, orderId);
    if (oldOrderId) this.state.remove(pair, oldOrderId);
    return orderId;
  }
  async getOrders(pair, orderIds) {
    if (!orderIds) orderIds = this.state.getOrders(pair).join(",");
    const orders = await this.#privateApi("QueryOrders", { txid: orderIds });
    return Object.keys(orders).map((id) => {
      return { id, price: +orders[id].price, volume: +orders[id].vol_exec, cost: +orders[id].cost };
    });
  }
  async getOpenClosedOrders(state) {
    if (state == "open") return (await this.#privateApi("OpenOrders")).open;
    else (await this.#privateApi("ClosedOrders")).closed;
  }
};
