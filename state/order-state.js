import { readFileSync, writeFileSync } from "node:fs";

export default class OrderState {
  constructor(filePath) {
    this.filePath = filePath;
  }
  // Function to load the state from a JSON file
  #loadFile() {
    try {
      return JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (error) {
      return [];
    }
  }
  // Function to save the state to a JSON file
  #updateFile(state) {
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }
  getOrders(cb) {
    const orders = OrderState.loadFile();
    if (cb) orders.filter(cb);
  }
  addOrder(id, price, volume, cost, timeStamp = new Date()) {
    const orders = this.#loadFile();
    orders.push({ id, price, volume, cost, timeStamp });
    this.#updateFile(orders);
  }
  removeOrders(orderIds) {
    if (!Array.isArray(orderIds)) orderIds = [orderIds];
    this.#updateFile(this.#loadFile().filter((order) => !orderIds.includes(order.id)));
  }
}
