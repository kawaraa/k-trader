import { createHash, createHmac } from "node:crypto";
import { parseNumbers, request } from "../utilities.js";
import eventEmitter from "../event-emitter.js";

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
  async getTradableAssetPrices(currency = "EUR") {
    const pairs = [];
    const balances = {};
    const assets = await this.publicApi(`/AssetPairs`);
    const assetsBlc = await this.balance();
    balances.eur = +assetsBlc.ZEUR;

    for (const pair in assets) {
      if (assets[pair].quote.includes(currency) && assets[pair].altname.endsWith(currency)) {
        pairs.push(assets[pair].altname);
        const case1 = assets[pair].base;
        const case2 = pair.replace("ZEUR", "");
        const case3 = pair.replace("EUR", "");
        if (!isNaN(+assetsBlc[case1])) balances[pair] = +assetsBlc[case1];
        else if (!isNaN(+assetsBlc[case2])) balances[pair] = +assetsBlc[case2];
        else if (!isNaN(+assetsBlc[case3])) balances[pair] = +assetsBlc[case3];
      }
    }

    const currencies = await this.publicApi(`/Ticker?pair=${pairs.join(",")}`);
    Object.keys(currencies).forEach((pair) => {
      const { a, b, c, v } = currencies[pair];
      const prices = [+c[0], +a[0], +b[0], parseInt(+c[0] * +v[1])];
      currencies[pair] = prices;
    });

    return { currencies, balances };
  }

  async balance() {
    return await this.#privateApi("Balance");
    // Object.keys(balance).forEach((k) => (balance[k != "ZEUR" ? k : "eur"] = +balance[k]));
  }

  async currentPrices(pair) {
    const data = await this.publicApi(`/Ticker?pair=${pair}`);
    const { a, b, c, v } = data[Object.keys(data)[0]];
    const prices = [+c[0], +a[0], +b[0], parseInt(+c[0] * +v[1])];
    return prices;
  }

  async pricesData(pair, interval = 240, days = 1) {
    const since = Math.round(Date.now() / 1000 - 60 * 60 * 24 * days);
    // "OHLC Data" stands for Open, High, Low, Close data, which represents the prices at which an asset opens, reaches its highest, reaches its lowest, and closes during a specific time interval.

    const ohlc = await this.publicApi(`/OHLC?pair=${pair}&interval=${interval}&since=${since}`);
    const data = ohlc[Object.keys(ohlc)[0]].map((item) => ({
      time: parseFloat(item[0]),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[6]),
    }));

    const last = data.at(-1);
    if (last.volume > 1 && last.open > 0 && last.close > 0) return data;
    return data.slice(0, -1); // Ignore/Drop last incomplete candle
  }

  async prices(pair, limit) {
    // const prices = await this.pricesData(pair, interval);
    // return prices.map((candle) => parseFloat(candle[4])); // candle[4] is the Closing prices
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

  async getOrders(pair, orderId, times = 1) {
    // if (!orderIds) orderIds = this.state.getBot(pair).orders.join(",");
    if (!orderId) orderId = this.state.getBot(pair).position;
    if (!orderId) return [];
    let orders = await this.#privateApi("QueryOrders", { txid: orderId });
    orders = Object.keys(orders).map((id) => {
      const { price, vol_exec, cost, opentm } = orders[id];
      return { id, price: +price, volume: +vol_exec, cost: +cost, createdAt: +opentm * 1000 };
    });
    if (orders[0]?.cost || times > 1) return orders;
    // await delay(1000);
    return this.getOrders(pair, orderId, times + 1);
  }

  async getOpenClosedOrders(state) {
    if (state == "open") return (await this.#privateApi("OpenOrders")).open;
    else (await this.#privateApi("ClosedOrders")).closed;
  }
}

export default KrakenExchangeProvider;

/* Endpoint use cases */
// // Latest price (most recent price, vol, etc)
// https://api.kraken.com/0/public/Ticker?pair=btceur,etheur,pepeeur
// // Tradable assets
// https://api.kraken.com/0/public/AssetPairs
// // Historical price trends
// https://api.kraken.com/0/public/OHLC?pair=etheur&interval=5
// // Bid/Ask spread only
// https://api.kraken.com/0/public/Spread?pair=etheur
