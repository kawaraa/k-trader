import { existsSync, readFileSync } from "node:fs";
import { appendFile, open, readFile, stat, writeFile } from "node:fs/promises";

// In prod limit Storing prices to 30 days (8640) and in local to 60 days (17280)
// dataLimit * 5 is the number of mins in 60 days.
const dataLimit = process.env.NODE_ENV === "production" ? 17280 : 17280;
const states = {};

class LocalState {
  #databaseFolder;
  #filePath;
  constructor(filename) {
    this.#databaseFolder = `${process.cwd()}/database/`;
    this.#filePath = `${this.#databaseFolder}${filename}.json`;
    this.data = JSON.parse(readFileSync(this.#filePath, "utf8"));
  }

  #getPricesFilePath(pair) {
    return `${this.#databaseFolder}prices/${pair}`;
  }

  async load() {
    try {
      const data = await JSON.parse(await readFile(this.#filePath, "utf8"));
      this.data = data;
      return data;
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
    const filePath = this.#getPricesFilePath(pair);
    try {
      const data = `\n${JSON.stringify(price)}`;
      if (price) return !existsSync(filePath) ? writeFile(filePath, data) : appendFile(filePath, data);
    } catch (error) {
      console.log(pair, "Could not append new price");
    }
  }
  async getLocalPrices(pair, numberOfLines = 1440, fromStart) {
    const filePath = this.#getPricesFilePath(pair);
    if (!existsSync(filePath)) return [];
    const file = await open(filePath, "r");
    const size = (await file.stat()).size;
    const length = Math.min(size, 1024 * (numberOfLines / 20)); // CHUNK_SIZE in KB, approximately 1KB = 20 lines in prices data
    const position = fromStart ? 0 : Math.max(0, size - length);

    const buffer = (await file.read({ buffer: Buffer.alloc(length), position, length })).buffer.toString();
    await file.close();

    const cb = (acc, line) => {
      try {
        const jsonLine = JSON.parse(line);
        acc.push(jsonLine);
        return acc;
      } catch (err) {
        return acc;
      }
    };
    return buffer.substring(buffer.indexOf("[")).trim().split(/\r?\n/).reduce(cb, []).slice(-numberOfLines);
  }
}

export default function getState(filename) {
  if (states[filename]) return states[filename];
  return (states[filename] = new LocalState(filename));
}
