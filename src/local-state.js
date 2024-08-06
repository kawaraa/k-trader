const { readFileSync, writeFileSync } = require("node:fs");

module.exports = class LocalState {
  #filePath;
  constructor(filename) {
    this.#filePath = `${process.cwd()}/database/${filename}.json`;
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
};
