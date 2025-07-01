// test-trading-script is a price-history-analysis-script
// import { Worker, parentPort, workerData, isMainThread } from "worker_threads";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { calcAveragePrice, calcPercentageDifference } from "../../shared-code/utilities.js";
import LocalState from "./local-state.js";
const getPath = (filename = "") => `${process.cwd()}/database/prices/${filename}`;

(async () => {
  try {
    // const files = readdirSync(getPath());
    setAskBidSpread();
  } catch (error) {
    console.log("Error:", error);
  }
})();

function setAskBidSpread(file) {
  const files = readdirSync(getPath());
  const state = new LocalState("traders-state");
  const newData = {};

  for (let file of files) {
    const pair = file.replace(".json", "");
    if (!state.data[pair]) continue;
    const prices = JSON.parse(readFileSync(getPath(file), "utf8"));
    const average =
      prices.reduce((total, p) => total + calcPercentageDifference(p[2], p[1]), 0) / prices.length;
    console.log(pair, average);
    state.data[pair].askBidSpread = +average.toFixed(2);
  }

  Object.keys(state.data)
    .filter((p) => state.data[p].askBidSpread >= 0 && state.data[p].askBidSpread <= 1)
    .toSorted((a, b) => state.data[a].askBidSpread - state.data[b].askBidSpread)
    .forEach((p) => (newData[p] = state.data[p]));

  // state.update(newData);
}
