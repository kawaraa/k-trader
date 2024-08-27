const { Bot, BotsManager } = require("../bots-manager");
const { parseError, isValidPair, isNumber } = require("../utilities");

module.exports = (router, fireStoreProvider, authRequired, production) => {
  router.get("/bots", authRequired, async (request, response) => {
    try {
      // const { pair } = req.params; // Todo: pass the pair as param
      const { pair } = request.query;
      const token = request.cookies?.idToken;
      if (pair) isValidPair(pair, true);

      const firestoreBots = {};
      (await fireStoreProvider.getDoc(token, "bots", pair)).forEach(({ document }) => {
        if (document) {
          const { name, fields, createTime, updateTime } = document;
          firestoreBots[name.split("/").slice(-1)] = new Bot({ ...fields, createTime, updateTime });
        }
      });

      if (production) {
        const bots = BotsManager.syncBots(firestoreBots);
        Object.keys(bots).map((pair) => fireStoreProvider.updateDoc(token, "bots", pair, bots[pair]));
      }

      response.json({ ...BotsManager.get(pair), balance: (await BotsManager.getEurBalance()).ZEUR });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.post("/bots", authRequired, async (request, response) => {
    try {
      let { pair, ...data } = request.body;
      const token = request.cookies?.idToken;
      data = new BotInfo(data);
      data.balance = 0;
      data.earnings = 0;
      data.bought = 0;
      data.sold = 0;
      data.orders = [];

      isValidPair(pair, true);
      const { fields, createTime, updateTime } = await fireStoreProvider.addDoc(token, "bots", pair, data);
      BotsManager.add(pair, { ...fields, createTime, updateTime });
      response.json(BotsManager.get(pair));
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.put("/bots", authRequired, async (request, response) => {
    try {
      const { pair, ...data } = request.body;
      const token = request.cookies?.idToken;
      isValidPair(pair, true);
      const bot = { ...BotsManager.get(pair)[pair], ...new BotInfo(data) };
      const { fields, updateTime } = await fireStoreProvider.updateDoc(token, "bots", pair, bot);
      BotsManager.update(pair, new Bot({ ...fields, updateTime }));
      response.json(BotsManager.get(pair));
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Change status to "on" or "off"
  router.patch("/bots", authRequired, async (request, response) => {
    try {
      const { pair, status } = request.query;
      isValidPair(pair, true);

      if (status == "on") BotsManager.run(pair);
      if (status == "off") BotsManager.stop(pair);
      // if (status == "on-all") BotsManager.runAll(5);
      // if (status == "off-all") BotsManager.stopAll();
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.delete("/bots", authRequired, async (request, response) => {
    try {
      const { pair } = request.query;
      isValidPair(pair, true);
      await fireStoreProvider.deleteDoc(request.cookies?.idToken, "bots", pair);
      BotsManager.remove(pair);
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.get("/bots/logs", authRequired, async (request, response) => {
    try {
      const { pair } = request.query;
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
    this.capital = this.setNumber(info.capital, 0, "capital", true);
    this.investment = this.setNumber(info.investment, 1, "investment", true);
    this.priceChange = this.setNumber(info.priceChange, 1.5, "priceChange", true);
    this.strategyRange = this.setNumber(info.strategyRange, 0.25, "strategyRange", true);
    this.mode = this.validateMode(info.mode);
    this.timeInterval = this.setNumber(info.timeInterval, 3, "timeInterval", true);
  }
  setNumber(value, minValue, name, throwError) {
    if (isNumber(value, minValue)) return value;
    if (throwError) throw new Error(`"${value}" is invalid ${name}.`);
  }
  validateMode(value) {
    if (["strict", "non-strict"].includes(value)) return value;
    throw new Error(`"${value}" is invalid mode.`);
  }
}
