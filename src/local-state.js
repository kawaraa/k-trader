import { readFileSync, writeFileSync, statSync } from "node:fs";

// In prod limit Storing prices to 30 days (8640) and in local to 60 days (17280)
// dataLimit * 5 is the number of mins in 60 days.
const dataLimit = process.env.NODE_ENV === "production" ? 17280 : 17280;

export default class LocalState {
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

  getBot(pair) {
    return this.load()[pair] || {};
  }

  updateBot(pair, data) {
    const state = this.load();
    Object.keys(data).forEach((key) => (state[pair][key] = data[key]));
    this.update(state);
  }

  getLocalPrices(pair, limit) {
    const filePath = this.#getPricesFilePath(pair);
    try {
      const data = JSON.parse(readFileSync(filePath, "utf8"));
      if (statSync(filePath).size / (1024 * 1024) >= 2) data.shift();
      return data && data[0]?.askPrice ? data.slice(-limit) : [];
    } catch (error) {
      return [];
    }
  }
  updateLocalPrices(pair, prices) {
    let data = this.getLocalPrices(pair);
    data.push(prices);
    return writeFileSync(this.#getPricesFilePath(pair), JSON.stringify(data));
  }
}
