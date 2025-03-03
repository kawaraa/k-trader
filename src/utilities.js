const cryptocurrencies = require("./currencies.json");

function isNumber(num, min, max) {
  const N = Number.parseFloat(num);
  if (Number.isNaN(N)) return false;
  else if (min && min > N) return false;
  else if (max && max < N) return false;
  return true;
}
function parseNumbers(data) {
  if (Array.isArray(data)) return data.map((n) => +n);
  for (const key in data) data[key] = +data[key];
  return data;
}
function extractNumbers(str) {
  return !str ? 0 : parseNumbers(str.match(/\d+(\.\d+)?/gim));
}
function strIncludes(str = "", text) {
  return text.split(",").every((w) => str.toLowerCase().includes(w.toLowerCase()));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitIntoChunks(data) {
  const chunkSize = Math.ceil(data.length / Math.ceil(data.length / 100)); // Calculate chunk size to get around 100 tasks
  const result = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    result.push(data.slice(i, i + chunkSize));
  }
  return result;
}
function dateToString(date = new Date(), seconds) {
  const unWantedChar = seconds ? -5 : -8;
  return new Date(date).toISOString().slice(0, unWantedChar).replace("T", " ");
}
function toShortDate(date = new Date()) {
  return date
    .toString()
    .replace(date.getFullYear() + " ", "")
    .slice(4, 16);
}

function isValidPair(pair, throwError) {
  if (cryptocurrencies[pair]) return pair;
  if (!throwError) return null;
  else throw new Error(`Unsupported cryptocurrency pair: ${pair}`);
}

function parseError(value, msgs = "") {
  if (value && typeof value != "object") return msgs + value + " ";
  if (value instanceof Error && value.message) return msgs + value.message + " ";
  else if (Array.isArray(value)) value.forEach((item) => (msgs += parseError(item)));
  else Object.keys(value).forEach((k) => (msgs += parseError(value[k])));
  return msgs?.trim() || "Unknown error";
}
function request() {
  return fetch(...arguments)
    .then(async (res) => {
      let data = await res.text();
      try {
        data = JSON.parse(data);
      } catch (err) {}
      if (!res.ok) throw data;
      return data;
    })
    .catch((error) => {
      throw new Error(parseError(error));
    });
}

module.exports = {
  request,
  parseError,
  delay,
  splitIntoChunks,
  dateToString,
  toShortDate,
  parseNumbers,
  extractNumbers,
  isValidPair,
  isNumber,
  strIncludes,
};
