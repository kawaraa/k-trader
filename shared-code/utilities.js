export function request() {
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

export function parseError(value, msgs = "") {
  if (value && typeof value != "object") return msgs + value + " ";
  if (value instanceof Error && value.message) return msgs + value.message + " ";
  else if (Array.isArray(value)) value.forEach((item) => (msgs += parseError(item)));
  else Object.keys(value).forEach((k) => (msgs += parseError(value[k])));
  return msgs?.trim() || "Unknown error";
}

export function parseNumInLog(str) {
  return str.split(" ").map((item) => parseFloat(item) || item);
}

export function isNumber(number, min, max) {
  const num = parseFloat(number);
  if (isNaN(num)) return false;
  else if (!isNaN(min) && min > num) return false;
  else if (!isNaN(max) && max < num) return false;
  return true;
}
export function parseNumbers(data) {
  if (Array.isArray(data)) return data.map((n) => +n);
  for (const key in data) data[key] = +data[key];
  return data;
}
export function extractNumbers(str) {
  return !str ? 0 : parseNumbers(str.match(/\d+(\.\d+)?/gim));
}
export function getMaxMin(number, min, max) {
  return Math.min(Math.max(number, min), max);
}
export function isNumberInRangeOf(num, min, max) {
  const N = Number.parseFloat(num);
  if (Number.isNaN(N)) return false;
  else if (min && min > N) return false;
  else if (max && max < N) return false;
  return true;
}
export function strIncludes(str = "", text) {
  return text.split(",").every((w) => str.toLowerCase().includes(w.toLowerCase()));
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function removeDuplicateElements(array) {
  newArray = [];
  for (const item of array) {
    if (newArray.find((it) => JSON.stringify(it) == JSON.stringify(item))) continue;
    newArray.push(item);
  }
  return newArray;
}

export function splitIntoChunks(data) {
  const chunkSize = Math.ceil(data.length / Math.ceil(data.length / 100)); // Calculate chunk size to get around 100 tasks
  const result = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    result.push(data.slice(i, i + chunkSize));
  }
  return result;
}
export function roughSizeOfObject(object) {
  const seen = new WeakSet();

  const sizeOf = (obj) => {
    if (obj === null || obj === undefined) return 0;
    if (typeof obj === "boolean") return 4;
    if (typeof obj === "number") return 8;
    if (typeof obj === "string") return obj.length * 2;
    if (typeof obj === "object") {
      if (seen.has(obj)) return 0;
      seen.add(obj);
      let bytes = 0;
      for (let key in obj) {
        bytes += sizeOf(key);
        bytes += sizeOf(obj[key]);
      }
      return bytes;
    }
    return 0;
  };

  return sizeOf(object);
}

export function dateToString(date = new Date(), seconds) {
  const unWantedChar = seconds ? -5 : -8;
  return new Date(date).toISOString().slice(0, unWantedChar).replace("T", " ");
}
export function toShortDate(date = new Date()) {
  return date
    .toString()
    .replace(date.getFullYear() + " ", "")
    .slice(4, 16);
}
export function isOlderThan(timestamp, hours) {
  return (Date.now() - new Date(timestamp || Date.now()).getTime()) / 60000 / 60 > hours;
}

// export function isValidPair(pair, throwError) {
//   if (cryptocurrencies[pair]) return pair;
//   if (!throwError) return null;
//   else throw new Error(`Unsupported cryptocurrency pair: ${pair}`);
// }

export function calcAveragePrice(prices) {
  if (prices.length === 0) throw new Error("Price list cannot be empty.");
  const total = prices.reduce((sum, price) => sum + price, 0);
  return +(total / prices.length).toFixed(8);
}
export function calcPercentageDifference(oldPrice, newPrice) {
  const difference = newPrice - oldPrice;
  if (difference == 0) return 0;
  return +(newPrice > oldPrice ? (100 * difference) / newPrice : (difference / oldPrice) * 100).toFixed(2);
}
