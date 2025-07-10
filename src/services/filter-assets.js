import { readdir, readFile, unlink, writeFile } from "fs/promises";
import { calcPercentageDifference } from "../../shared-code/utilities.js";
import getState from "./local-state.js";
const getPath = (filename = "") => `${process.cwd()}/database/prices/${filename}`;

async function setAskBidSpread() {
  const files = await readdir(getPath());
  const state = getState("traders-state");
  const newState = {};

  for (let filename of files) {
    if (!state.data[filename]) continue; // state.data[filename] = {};
    const prices = await state.getLocalPrices(filename);
    const average =
      prices.reduce((total, p) => total + calcPercentageDifference(p[2], p[1]), 0) / prices.length;
    state.data[filename].askBidSpread = +average.toFixed(2);
  }

  Object.keys(state.data)
    .filter((p) => state.data[p].askBidSpread >= 0 && state.data[p].askBidSpread <= 1)
    .toSorted((a, b) => state.data[a].askBidSpread - state.data[b].askBidSpread)
    .forEach((p) => (newState[p] = state.data[p]));

  state.update(newState);
}
setAskBidSpread();

async function reformPricesFiles() {
  const files = await readdir(getPath());

  for (let file of files) {
    if (!file.includes(".json")) continue;
    const data = JSON.parse(await readFile(getPath(file), "utf8")).reduce(
      (acc, p) => acc + `\n${JSON.stringify(p)}`,
      ""
    );

    await writeFile(getPath(file.replace(".json", "")), data);
    await unlink(getPath(file));
  }
}
// reformPricesFiles();
