const { statSync, existsSync, mkdirSync, readFileSync } = require("node:fs");
const express = require("express");
const { rateLimiter, cookiesParser, isAuthenticated } = require("./src/routes/middlewares.js");
// const KrakenExchangeProvider = require("./src/kraken-ex-provider.js");
const fireStoreProvider = require("./src/firebase-provider");

const { isValidPair, parseError } = require("./src/utilities.js");
// const LocalState = require("./src/local-state.js");
// const pairs = Object.keys(require("./src/currencies.json"));

mkdirSync("database/logs", { recursive: true });
mkdirSync("database/prices", { recursive: true });

const prod = process.env.NODE_ENV === "production";
const port = 3000;
const server = express();
// const state = new LocalState("cli-state");
// const kraken = new KrakenExchangeProvider(require("./.env.json").KRAKEN_CREDENTIALS, state);

// async function fetchStorePrices() {
//   if (prod) return;
//   console.log("Started recording prices", pairs.length);
//   for (const pair of pairs) {
//     try {
//       await kraken.currentPrices(pair);
//     } catch (error) {
//       console.log(`Error with ${pair}`, error.message);
//     }
//   }
//   console.log("Finish recording prices, will start again after 5 mins");
//   setTimeout(fetchStorePrices, 60000 * 5);
// }

// const maxAge = 60 * 60 * 24 * 7; // 1 week (weekSec)
const maxAge = 30 * 24 * 3600 * 1000; // 30 days
const cookieOptions = { httpOnly: true, secure: prod, maxAge, path: "/", sameSite: "lax" }; // strict
const authRequired = (...args) => isAuthenticated(...args, fireStoreProvider, cookieOptions);

try {
  // Apply the rate limiting all requests by adding rate limiter middleware to all routes
  server.use(rateLimiter);
  server.use(cookiesParser);
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));

  const apiRouter = express.Router();
  require("./src/routes/auth")(apiRouter, fireStoreProvider, authRequired, cookieOptions);
  require("./src/routes/bots")(apiRouter, fireStoreProvider, authRequired, prod);

  apiRouter.get("/prices/:pair", authRequired, ({ params: { pair } }, response) => {
    const filePath = `${process.cwd()}/database/prices/${pair}.json`;
    try {
      isValidPair(pair, true);
      if (!existsSync(filePath)) throw new Error(`No prices data for ${pair} pair`);
      const prices = JSON.parse(readFileSync(`${process.cwd()}/database/prices/${pair}.json`, "utf8"));
      const since = Date.parse(statSync(`${process.cwd()}/database/prices/${pair}.json`).birthtime);
      response.json({ since, prices });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  server.use("/api", apiRouter);

  server.use(express.static(`${__dirname}/public/`));
  // Serve static files from the "out" directory
  server.use(express.static(`${__dirname}/out/`));
  // Serve the index.html file for any unknown routes (SPA behavior)
  server.get("*", (req, res) => {
    res.sendFile(`${__dirname}/out/index.html`);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`Server is running on http://localhost:${port}`);
  });

  // fetchStorePrices();
} catch (error) {
  console.log("App error: ", error);
}
