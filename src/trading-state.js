const { readFileSync, writeFileSync } = require("node:fs");
const { dateToString } = require("./utilities");

module.exports = class TradingState {
  constructor(filePath) {
    this.filePath = `database/${filePath}`;
  }
  // Function to load the state from a JSON file
  #loadFile() {
    try {
      return JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (error) {
      return { spike: "", orders: [] };
    }
  }
  // Function to save the state to a JSON file
  #updateFile(state) {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  addOrder(orderId) {
    const state = this.#loadFile();
    state.orders.push(orderId);
    this.#updateFile(state);
  }
  getOrders() {
    return this.#loadFile().orders;
  }
  remove(orderIds) {
    if (!Array.isArray(orderIds)) orderIds = [orderIds];
    const state = this.#loadFile();
    state.orders = state.orders.filter((id) => !orderIds.includes(id));
    this.#updateFile(state);
  }
  // updateSpike(lowPrice, heighPrice, time = dateToString()) {
  //   const state = this.#loadFile();
  //   state.spike = `${lowPrice}_${heighPrice}_${time}`;
  //   this.#updateFile(state);
  // }
  // getSpike() {
  //   let [low, high, time] = this.#loadFile().spike.split("_");
  //   low = Number.isNaN(+low) ? 0 : +low;
  //   high = Number.isNaN(+high) ? 0 : +high;
  //   return [low, high, time || ""];
  // }
};
