const { readFileSync, writeFileSync } = require("node:fs");

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
    const state = this.load();
    return state[pair].orders;
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

  getLocalPrices(pair, limit = 864) {
    limit = limit > 864 ? 864 : limit; // Limit Storing prices to 3 days
    try {
      const data = JSON.parse(readFileSync(this.#getPricesFilePath(pair), "utf8")).slice(-limit);
      return data && data[0]?.askPrice ? data : [];
    } catch (error) {
      return [];
    }
  }
  updateLocalPrices(pair, prices) {
    // const data = this.getLocalPrices(pair);
    let data = [];
    try {
      data = JSON.parse(readFileSync(this.#getPricesFilePath(pair), "utf8")).slice(-8640);
    } catch (error) {}
    data.push(prices);
    return writeFileSync(this.#getPricesFilePath(pair), JSON.stringify(data));
  }
};
