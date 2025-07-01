import { readFileSync, readdirSync } from "node:fs";
import { calcPercentageDifference } from "../../shared-code/utilities.js";
import LocalState from "./local-state.js";
const getPath = (filename = "") => `${process.cwd()}/database/prices/${filename}`;

function setAskBidSpread() {
  const files = readdirSync(getPath());
  const state = new LocalState("traders-state");
  const newData = {};

  for (let file of files) {
    const pair = file.replace(".json", "");
    if (!state.data[pair]) continue;
    const prices = JSON.parse(readFileSync(getPath(file), "utf8"));
    const average =
      prices.reduce((total, p) => total + calcPercentageDifference(p[2], p[1]), 0) / prices.length;
    state.data[pair].askBidSpread = +average.toFixed(2);
  }

  Object.keys(state.data)
    .filter((p) => state.data[p].askBidSpread >= 0 && state.data[p].askBidSpread <= 1)
    .toSorted((a, b) => state.data[a].askBidSpread - state.data[b].askBidSpread)
    .forEach((p) => (newData[p] = state.data[p]));

  state.update(newData);
}

setAskBidSpread();
