const { createHash, createHmac } = require("node:crypto");
const { parseNumbers, delay, request } = require("./utilities.js");

module.exports = class KrakenExchangeProvider {
  #apiUrl;
  #apiKey;
  #apiSecret;

  constructor(credentials, state) {
    this.#apiUrl = "https://api.kraken.com";
    this.#apiKey = credentials.apiKey;
    this.#apiSecret = credentials.privateKey;
    this.state = state;
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
  // Function to make calls to private API
  #privateApi(path, data = {}) {
    path = `/0/private/${path}`;
    data.nonce = Date.now() * 1000;
    const body = JSON.stringify(data);

    return request(`${this.#apiUrl}${path}`, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "API-Key": this.#apiKey,
        "API-Sign": this.#getSignature(path, data),
      },
      method: "POST",
      body,
    });
  }
  // Function to make calls to public API
  publicApi(path, options) {
    return request(`${this.#apiUrl}/0/public${path}`, options);
  }

  async balance(pair) {
    const curMap = { BTC: "XXBT", ETH: "XETH" };
    const key = pair.replace("ZEUR", "").replace("EUR", "");
    const balance = parseNumbers(await this.#privateApi("Balance"));

    if (pair == "all") return balance;
    return { eur: +balance.ZEUR, crypto: +(balance[curMap[key]] || balance[key] || 0) };
  }
  async currentPrice(pair) {
    const data = await this.publicApi(`/Ticker?pair=${pair}`);
    return parseFloat(data[Object.keys(data)[0]].c[0]);
  }
  async pricesData(pair, lastDays = 0.5, interval = 5) {
    // "OHLC Data" stands for Open, High, Low, Close data, which represents the prices at which an asset opens, reaches its highest, reaches its lowest, and closes during a specific time interval.
    let allPrices = [];
    let timestamp = "";

    while (lastDays > (allPrices.length * 5) / 60 / 24) {
      const data = await this.publicApi(`/OHLC?pair=${pair}&interval=${interval}&since=${timestamp}`);
      allPrices = data[Object.keys(data)[0]].concat(allPrices);
      timestamp = allPrices[0][0]; // The oldest timestamp in the retrieved data
      await delay(5000);
    }
    return allPrices.slice(-((lastDays * 24 * 60) / 5));
  }
  async prices(pair, lastDays) {
    const prices = await this.pricesData(pair, lastDays);
    return prices.map((candle) => parseFloat(candle[4])); // candle[4] is the Closing prices
  }
  async createOrder(type, ordertype, pair, volume, price) {
    const data = { type, ordertype, pair, volume: volume + "", price: price + "", expiretm: "+120" };
    return (await this.#privateApi("AddOrder", data)).txid[0]; // Return the order ID
  }
  async cancelOrder(id) {
    return !(await this.#privateApi("CancelOrder", { txid: id })).pending;
  }
  async getOrders(pair, orderIds) {
    const stateOrders = this.state.getBotOrders(pair);
    if (!orderIds) {
      orderIds = stateOrders
        .map((o) => o.split("::"))
        .flat()
        .filter((o) => o?.trim())
        .join(",")
        ?.trim();
      if (!orderIds) return [];
    }

    const orders = await this.#privateApi("QueryOrders", { txid: orderIds });
    return {
      stateOrders,
      orders: Object.keys(orders).map((id) => {
        const { price, vol_exec, cost, descr, status } = orders[id];
        return { id, price: +price, volume: +vol_exec, cost: +cost, type: descr.type, status };
      }),
    };
  }
  async getOpenClosedOrders(state, pair, type) {
    let response = {};
    const orders = [];
    if (state == "open") response = (await this.#privateApi("OpenOrders")).open;
    else response = (await this.#privateApi("ClosedOrders")).closed;

    return Object.keys(response).forEach((id) => {
      const { price, vol_exec, cost, descr } = orders[id];
      const condition = descr.pair === pair && (!type || type == descr.type);
      if (condition) orders.push({ id, price: +price, volume: +vol_exec, cost: +cost });
    });
  }
};
