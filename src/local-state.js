const { readFileSync, writeFileSync } = require("node:fs");
// In prod limit Storing prices to 30 days (8640) and in local to 60 days (17280)
// dataLimit * 5 is the number of mins in 60 days.
const dataLimit = process.env.NODE_ENV === "production" ? 17280 : 17280;

module.exports = class LocalState {
  #databaseFolder;
  #filePath;
  constructor(filename) {
    this.#databaseFolder = `${process.cwd()}/database/`;
    this.#filePath = `${this.#databaseFolder}${filename}.json`;
  }

  #getPricesFilePath(pair) {
    return `${this.#databaseFolder}prices/${pair}.json`;
  }
  load() {
    try {
      return JSON.parse(readFileSync(this.#filePath, "utf8"));
    } catch (error) {
      return {};
    }
  }
  update(state) {
    writeFileSync(this.#filePath, JSON.stringify(state, null, 2));
  }

  getBots(pair) {
    const state = this.load();
    return !pair ? state : state[pair];
  }
  // addBot() {}
  // updateBot() {}
  // removeBot() {}
  getBotOrders(pair) {
    return this.load()[pair].orders;
  }
  addBotOrder(pair, orderId) {
    const state = this.load();
    state[pair].orders.push(orderId);
    this.update(state);
  }
  removeBotOrder(pair, orderId) {
    const state = this.load();
    state[pair].orders = state[pair].orders.filter((id) => id != orderId);
    this.update(state);
  }

  getLocalPrices(pair, limit = 288 /* Default to 1 day */) {
    try {
      const data = JSON.parse(readFileSync(this.#getPricesFilePath(pair), "utf8")).slice(-limit);
      return data && data[0]?.askPrice ? data : [];
    } catch (error) {
      return [];
    }
  }
  async updateLocalPrices(pair, prices) {
    const data = await this.getLocalPrices(pair, dataLimit);
    data.push(prices);
    return writeFileSync(this.#getPricesFilePath(pair), JSON.stringify(data));
  }
  get(pair) {
    return this.getBots(pair)[key];
  }
  update(pair, key, data) {
    const state = this.getBots(pair);
    state[pair][key] = data;
    this.update(state);
  }
};
