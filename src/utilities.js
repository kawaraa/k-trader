const { tradable } = require("./currencies.json");

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateToString(date = new Date(), seconds) {
  const unWantedChar = seconds ? -5 : -8;
  return new Date(date).toISOString().slice(0, unWantedChar).replace("T", " ");
}

function isValidPair(pair, throwError) {
  if (tradable[pair]) return pair;
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

module.exports = { request, parseError, delay, dateToString, parseNumbers, isValidPair, isNumber };
