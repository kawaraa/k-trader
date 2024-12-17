// test-currencies-script
const { readFileSync } = require("fs");
const currencies = require("./currencies.json");
const runTradingTest = require("./test-trading-script.js");

const capital = +process.argv[2] || 100; // Amount in EUR which is the total money that can be used for trading
// const investment = +process.argv[3] || 10; // investing Amount in EUR that will be used every time to by crypto
const minStrategyRange = +process.argv[3] || 0.25; // In days, min value 0.25 day which equivalent to 6 hours
const minPercentPriceChange = +process.argv[4] || 1.25; // Price Percentage Threshold, min value 1.25
const modes = process.argv[5];
const interval = +process.argv[6] || 5; // from 5 to 11440, time per mins E.g. 11440 would be every 24 hours

// Command example: node test-trading-script.js ETHEUR 100 99 0.25 1.1 near-low > database/log/all.log 2>&1

// const pairs = Object.keys(currencies); // .slice();
const readyPairs = [
  // "CRVEUR",
  // "CXTEUR",
  // "EWTEUR",
  // "STGEUR",
  // "KINEUR",
  // "SHIBEUR",
  // "TURBOEUR",
  // "MOGEUR",
  // "WIFEUR",
  // "BIGTIMEEUR",
  // "KMNOEUR",
  // "PENDLEEUR",
  // "PRCLEUR",
  // "SAGAEUR",
  // "SUIEUR",
  // "SUPEREUR",
  // "ZETAEUR",
  // "TNSREUR",
  // "RAYEUR",
  // "OXYEUR",
  // "BONKEUR",
  // "CSMEUR",
  // "CPOOLEUR",
  // "TAOEUR",
  // "STEPEUR",
  // "NOSEUR",
  // "ORCAEUR",
  // "BLUREUR",
  // "BSXEUR",
  // "ENAEUR",
  // "TEEREUR",
  // "PEPEEUR",
  // "APTEUR",
  // "TIAEUR",
  // "YGGEUR",
  // "DYMEUR",
  // "SEIEUR",
  // "FTMEUR",
  // "JUPEUR",
  // "PYTHEUR",
  // "USTEUR",
  // "XDGEUR",
  // "STXEUR",
  // "FLOKIEUR",
  // "RUNEEUR",
  // "ZEXEUR",
  // "ZKEUR",
  // "PRIMEEUR",
  // "ETHFIEUR",
  // "JTOEUR",
  // "MEMEEUR",
  // "HFTEUR",
  // "RLCEUR",
  // "GTCEUR",
  // "ACHEUR",
  // "NTRNEUR",
  // "SAMOEUR",
  // "AEVOEUR",
  // "ETHEUR",
  // "SOLEUR",

  "INJEUR",
  "UNFIEUR",
  "KP3REUR",
  "UNIEUR",
  "ARKMEUR",
  "FETEUR",
  "ZECEUR",
  "ALTEUR",
  "SAFEEUR",
  "CELREUR",
  "MASKEUR",
  "WOOEUR",
  "AVAXEUR",
  "GALAEUR",
  "MOVREUR",
  "MLNEUR",
  "BEAMEUR",
  "MVEUR",
  "CXTEUR",
  "PORTALEUR",
  "AGLDEUR",
  "SDNEUR",
  "WEUR",
  "LUNAEUR",
  "XRTEUR",
];

(async () => {
  for (const pair of readyPairs) {
    if (alreadyInProgress(pair)) continue;
    // if (/stable|no price|ready/gim.test(currencies[pair].note)) continue;
    await runTradingTest(pair, capital, minStrategyRange, minPercentPriceChange, modes, interval);

    // if (global.gc) global.gc(); // Forces garbage collection
  }
})();

function alreadyInProgress(pair) {
  const getFilePath = (number) => `${process.cwd()}/database/logs/result-${number}.log`;
  return readFileSync(getFilePath(1)).includes(pair) || readFileSync(getFilePath(2)).includes(pair);
}
