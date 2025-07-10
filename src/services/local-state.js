import { appendFile, open, readFile, stat, writeFile } from "node:fs/promises";

// In prod limit Storing prices to 30 days (8640) and in local to 60 days (17280)
// dataLimit * 5 is the number of mins in 60 days.
const dataLimit = process.env.NODE_ENV === "production" ? 17280 : 17280;

export default class LocalState {
  #databaseFolder;
  #filePath;
  constructor(filename) {
    this.#databaseFolder = `${process.cwd()}/database/`;
    this.#filePath = `${this.#databaseFolder}${filename}.json`;
    this.data = this.load();
  }

  #getPricesFilePath(pair) {
    return `${this.#databaseFolder}prices/${pair}`;
  }

  async load() {
    try {
      return JSON.parse(await readFile(this.#filePath, "utf8"));
    } catch (error) {
      return {};
    }
  }
  async update(state) {
    await writeFile(this.#filePath, JSON.stringify(state, null, 2));
    this.data = state;
  }

  async getAllLocalPrices(pair, limit) {
    const filePath = this.#getPricesFilePath(pair);
    try {
      const data = JSON.parse(await readFile(filePath, "utf8"));
      if ((await stat(filePath)).size / (1024 * 1024) >= 5) data.shift();
      return data && data[0] ? data.slice(-limit) : [];
    } catch (error) {
      return [];
    }
  }

  async appendToLocalPrices(pair, price) {
    try {
      return appendFile(this.#getPricesFilePath(pair), `\n${JSON.stringify(price)}`);
    } catch (error) {
      console.log(pair, "Could not append new price");
    }
  }
  async getLocalPrices(pair, numberOfLines = 1440, fromStart) {
    let CHUNK_SIZE = 1024 * (numberOfLines / 20); // xxKB chunks, approximately 1KB = 20 lines in prices
    let position = 0;

    const file = await open(this.#getPricesFilePath(pair), "r");
    if (!fromStart) position = Math.max(0, (await file.stat()).size - CHUNK_SIZE);
    const { buffer } = await file.read({ buffer: Buffer.alloc(CHUNK_SIZE), position, length: CHUNK_SIZE });

    const data = buffer.toString();
    await file.close();

    return data.substring(data.indexOf("[")).split(/\r?\n/).map(JSON.parse).slice(-numberOfLines);
  }
}
