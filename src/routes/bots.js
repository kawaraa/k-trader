const { statSync, existsSync, readFileSync } = require("node:fs");
const { Bot, BotsManager } = require("../bots-manager");
const { parseError, isValidPair, isNumber } = require("../utilities");

module.exports = (router, fireStoreProvider, authRequired, production) => {
  // Get bots
  router.get("/bots", authRequired, async (request, response) => {
    try {
      const { pair } = request.query;
      // const token = request.cookies?.idToken;
      if (pair) isValidPair(pair, true);

      // const firestoreBots = {};
      // (await fireStoreProvider.getDoc(token, "bots", pair)).forEach(({ document }) => {
      //   if (document) {
      //     const { name, fields, createTime, updateTime } = document;
      //     firestoreBots[name.split("/").slice(-1)] = new Bot({ ...fields, createTime, updateTime });
      //   }
      // });

      // if (production) {
      //   const bots = BotsManager.syncBots(firestoreBots);
      //   Object.keys(bots).map((pair) => fireStoreProvider.updateDoc(token, "bots", pair, bots[pair]));
      // }

      response.json({ ...BotsManager.get(pair), balance: (await BotsManager.getEurBalance()).ZEUR });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Create bot
  router.post("/bots", authRequired, async (request, response) => {
    try {
      let { pair, ...data } = request.body;
      // const token = request.cookies?.idToken;
      data = new BotInfo(data);
      data.balance = 0;
      data.trades = [];
      data.position = null;

      isValidPair(pair, true);
      // const { fields, createTime, updateTime } = await fireStoreProvider.addDoc(token, "bots", pair, data);
      // BotsManager.add(pair, new Bot({ ...fields, createTime, updateTime }));
      BotsManager.add(pair, new Bot(data));
      response.json(BotsManager.get(pair));
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Update bot
  router.put("/bots", authRequired, async (request, response) => {
    try {
      const { pair, ...data } = request.body;
      // const token = request.cookies?.idToken;
      isValidPair(pair, true);
      const bot = { ...BotsManager.get(pair)[pair], ...new BotInfo(data) };
      // const { fields, updateTime } = await fireStoreProvider.updateDoc(token, "bots", pair, bot);
      // BotsManager.update(pair, new Bot({ ...fields, updateTime }));
      BotsManager.update(pair, new Bot(bot));
      response.json(BotsManager.get(pair));
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Change status to "on" or "off"
  router.patch("/bots", authRequired, async (request, response) => {
    try {
      const { pair, status } = request.query;
      if (pair != "all") isValidPair(pair, true);

      if (status == "on") BotsManager.run(pair);
      if (status == "off") BotsManager.stop(pair);
      if (status == "on-all") BotsManager.runAll();
      if (status == "off-all") BotsManager.stopAll();
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Delete bot
  router.delete("/bots", authRequired, async (request, response) => {
    try {
      const { pair } = request.query;
      isValidPair(pair, true);
      // await fireStoreProvider.deleteDoc(request.cookies?.idToken, "bots", pair);
      BotsManager.remove(pair);
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Sell all assets
  router.put("/bots/position/:pair", authRequired, async (request, response) => {
    try {
      const { pair } = request.params;
      isValidPair(pair, true);
      await BotsManager.sellAll(pair);
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Reset Transitions
  router.put("/bots/reset", authRequired, async (request, response) => {
    try {
      BotsManager.resetState(request.query.pair);
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Get bot prices history
  router.get("/bots/prices/:pair", authRequired, (request, response) => {
    try {
      const pair = request.params.pair;
      const other = parseInt(request.query.other);
      const name = pair + (other > 1 ? "-" + (other - 1) : "") + ".json";
      const filePath = `${process.cwd()}/database/prices/${other > 0 ? "bots/" : ""}${name}`;

      isValidPair(pair, true);
      if (!existsSync(filePath)) throw new Error(`No prices data for ${pair} pair`);
      // const prices = JSON.parse(readFileSync(`${process.cwd()}/database/prices/${pair}.json`, "utf8"));
      // const since = Date.parse(statSync(`${process.cwd()}/database/prices/${pair}.json`).birthtime);
      // response.json({ since, prices });
      response.sendFile(filePath);
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Get bot logs
  router.get("/bots/logs/:pair", authRequired, async (request, response) => {
    try {
      const { pair } = request.params;
      isValidPair(pair, true);
      response.sendFile(`${process.cwd()}/database/logs/${pair}.log`);
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  return router;
};

class BotInfo {
  constructor(info) {
    this.interval = this.setNumber(info.interval, 1, "interval", true);
    this.capital = this.setNumber(info.capital, 0, "capital", true);
    this.trader = info.trader;
    this.mode = info.mode;
  }
  setNumber(value, minValue, name, throwError) {
    if (isNumber(value, minValue)) return value;
    if (throwError) throw new Error(`"${value}" is invalid ${name}.`);
  }
  // setMode(value) {
  //   const mode = getSupportedModes().includes(value);
  //   if(!mode) throw new Error(`"${value}" is invalid ${name}.`);
  // }
}
