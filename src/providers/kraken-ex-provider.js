const { createHash, createHmac } = require("node:crypto");
const { parseNumbers, request } = require("../utilities.js");

class KrakenExchangeProvider {
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

  #checkError(res) {
    if (!res.error[0]) return res.result;
    else throw new Error(res.error.reduce((acc, err) => acc + "\n" + err, ""));
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
    }).then(this.#checkError);
  }

  // Function to make calls to public API
  publicApi(path, options) {
    return request(`${this.#apiUrl}/0/public${path}`, options).then(this.#checkError);
  }

  async balance(pair) {
    const curMap = { BTC: "XXBT", ETH: "XETH" };
    const key = pair.replace("EUR", "");
    const balance = parseNumbers(await this.#privateApi("Balance"));

    if (pair == "all") return balance;
    return { eur: +balance.ZEUR, crypto: +(balance[curMap[key]] || balance[key] || 0) };
  }

  async currentPrices(pair) {
    const data = await this.publicApi(`/Ticker?pair=${pair}`);
    const { a, b, c } = data[Object.keys(data)[0]];
    const prices = { tradePrice: +c[0], askPrice: +a[0], bidPrice: +b[0] };
    // this.state.updateLocalPrices(pair, prices);
    return prices;
  }

  async pricesData(pair, interval = 240, days = 0.5) {
    // const since = Math.round(Date.now() / 1000 - 60 * 60 * 24 * days);
    let since = ""; // Test it
    // "OHLC Data" stands for Open, High, Low, Close data, which represents the prices at which an asset opens, reaches its highest, reaches its lowest, and closes during a specific time interval.

    const data = await this.publicApi(`/OHLC?pair=${pair}&interval=${interval}&since=${since}`);
    return data[Object.keys(data)[0]].map((item) => ({
      time: parseFloat(item[0]),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[6]),
    }));
  }

  async prices(pair, limit) {
    // const prices = await this.pricesData(pair, interval);
    // return prices.map((candle) => parseFloat(candle[4])); // candle[4] is the Closing prices
    await this.currentPrices(pair);
    return this.state.getLocalPrices(pair, limit);
  }

  async createOrder(type, ordertype, pair, volume) {
    volume += "";
    const orderId = (await this.#privateApi("AddOrder", { type, ordertype, pair, volume })).txid[0];
    return orderId;
  }
  async editOrder(id, pair, price, volume) {
    volume += "";
    const orderId = (await this.#privateApi("AddOrder", { txid: id, pair, price, volume })).txid[0];
    return orderId;
  }

  async getOrders(pair, orderIds, times = 1) {
    if (!orderIds) orderIds = this.state.getBot(pair).orders.join(",");
    if (!orderIds) return [];
    let orders = await this.#privateApi("QueryOrders", { txid: orderIds });
    orders = Object.keys(orders).map((id) => {
      const { price, vol_exec, cost, opentm } = orders[id];
      return { id, price: +price, volume: +vol_exec, cost: +cost, createdAt: +opentm * 1000 };
    });
    if (orders[0]?.cost || times > 1) return orders;
    // await delay(1000);
    return this.getOrders(pair, orderIds, times + 1);
  }

  async getOpenClosedOrders(state) {
    if (state == "open") return (await this.#privateApi("OpenOrders")).open;
    else (await this.#privateApi("ClosedOrders")).closed;
  }
}

module.exports = KrakenExchangeProvider;
