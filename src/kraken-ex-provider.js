const { createHash, createHmac } = require("node:crypto");
const { parseNumbers } = require("./utilities.js");

module.exports = class Kraken {
  #apiUrl;
  #apiKey;
  #apiSecret;
  constructor(credentials) {
    this.#apiUrl = "https://api.kraken.com";
    this.#apiKey = credentials.apiKey;
    this.#apiSecret = credentials.privateKey;
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

  // Function to make calls to public API
  publicApi(path, options) {
    return fetch(`${this.#apiUrl}/0/public${path}`, options)
      .then((res) => res.json())
      .then(this.#checkError);
  }
  // Function to make calls to private API
  async privateApi(path, data = {}) {
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

  async balance(pair) {
    const curMap = { BTC: "XXBT", ETH: "XETH", SOL: "SOL" };
    const balance = parseNumbers(await this.privateApi("Balance"));
    return { eur: +balance.ZEUR, crypto: +(balance[pair] || balance[curMap[pair.replace("EUR", "")]]) };
  }
  async currentPrice(pair) {
    const data = await this.publicApi(`/Ticker?pair=${pair}`);
    return parseFloat(data[Object.keys(data)[0]].c[0]);
  }
  async pricesData(pair, interval = 5, timestamp = "") {
    const data = await this.publicApi(`/OHLC?pair=${pair}&interval=${interval}&since=${timestamp}`);
    return data[Object.keys(data)[0]];
  }
  async prices(pair) {
    const prices = await this.pricesData(pair);
    prices.pop();
    return prices.map((candle) => parseFloat(candle[4])); // candle[4] is the Closing prices
  }
  async createOrder(type, ordertype, pair, volume) {
    volume += "";
    return (await kraken.privateApi("AddOrder", { type, ordertype, pair, volume })).txid[0];
  }
  async getOrder(orderId) {
    const o = (await kraken.privateApi("QueryOrders", { txid: orderId }))[orderId];
    return { id: orderId, price: +o.price, volume: +o.vol_exec, cost: +cost + +fee };
  }
};
