const { Bot, BotsManager } = require("../bots-manager");
const { parseError, isValidPair } = require("../utilities");

module.exports = (router, fireStoreProvider, authRequired) => {
  router.get("/bots", authRequired, async (request, response) => {
    try {
      // const { pair } = req.params; // Todo: pass the pair as param
      const { pair } = request.query;
      const token = request.cookies?.idToken;
      if (pair) isValidPair(pair, true);

      const bots = {};
      (await fireStoreProvider.getDoc(token, "bots", pair)).forEach(({ document }) => {
        if (document) {
          const { name, fields, createTime, updateTime } = document;
          bots[name.split("/").slice(-1)] = new Bot({ ...fields, createTime, updateTime });
        }
      });
      BotsManager.syncBots(bots);
      response.json({ ...BotsManager.get(pair), balance: (await BotsManager.getEurBalance()).ZEUR });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.post("/bots", authRequired, async (request, response) => {
    try {
      const { pair, ...data } = request.body;
      const token = request.cookies?.idToken;
      data.balance = 0;
      data.sold = 0;
      data.bought = 0;
      data.earnings = 0;
      data.currentPrice = 0;
      data.averagePriceChange = 0;

      if (pair) isValidPair(pair, true);
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
      if (pair) isValidPair(pair, true);
      const { fields, updateTime } = await fireStoreProvider.updateDoc(token, "bots", pair, data);
      BotsManager.update(pair, new Bot({ ...fields, updateTime }));
      response.json(BotsManager.get(pair));
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.delete("/bots", authRequired, async (request, response) => {
    try {
      const { pair } = request.query;
      if (pair) isValidPair(pair, true);
      await fireStoreProvider.deleteDoc(request.cookies?.idToken, "bots", pair);
      BotsManager.remove(pair);
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Change status to "on" or "off"
  router.patch("/bots", authRequired, async (request, response) => {
    try {
      const { pair, status } = request.query;
      if (pair) isValidPair(pair, true);

      if (status == "on") BotsManager.run(pair);
      if (status == "off") BotsManager.stop(pair);
      // if (status == "on-all") BotsManager.runAll(5);
      // if (status == "off-all") BotsManager.stopAll();
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.get("/bots/logs", authRequired, async (request, response) => {
    try {
      const { pair } = request.query;
      if (pair) isValidPair(pair, true);
      response.sendFile(`${process.cwd()}/database/logs/${pair}.log`);
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  return router;
};
