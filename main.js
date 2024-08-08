require("node:fs").mkdirSync("database/logs", { recursive: true });
const express = require("express");
const { rateLimiter, cookiesParser, isAuthenticated } = require("./src/routes/middlewares.js");
const KrakenExchangeProvider = require("./src/kraken-ex-provider.js");
const fireStoreProvider = require("./src/firebase-provider");
const DailyTrader = require("./src/daily-trader");
const { isValidPair } = require("./src/utilities.js");
const LocalState = require("./src/local-state.js");

const prod = process.env.NODE_ENV === "production";
const port = 3000;
const server = express();

const pair = process.argv[2]; // The pair of the two currency that will be used for trading E.g. ETHEUR
const capital = +process.argv[3] || 100; // Amount in EUR which is the total money that can be used for trading
const investment = +process.argv[4] || 10; // Amount in EUR that will be used every time to by crypto
const priceChange = +process.argv[5] || 1.5; // price Percentage Threshold 0 to 100, default is 1.5
const strategyRange = +process.argv[6] || 0.5; // Range of the strategy in days, Default is 0.5 day
const safetyTimeline = +process.argv[7] || 8; // Number of hours, Default is 8 hours
const timeInterval = +process.argv[8] || 5; // 1 to 11440, time per mins E.g. 11440 would be every 24 hours

if (!isValidPair(pair)) {
  // const maxAge = 60 * 60 * 24 * 7; // 1 week (weekSec)
  const maxAge = 30 * 24 * 3600 * 1000; // 30 days
  const cookieOptions = { httpOnly: true, secure: prod, maxAge, path: "/", sameSite: "lax" }; // strict
  const authRequired = (...args) => isAuthenticated(...args, fireStoreProvider, cookieOptions);

  try {
    // Apply the rate limiting all requests by adding rate limiter middleware to all routes
    // server.use(rateLimiter);
    server.use(cookiesParser);
    server.use(express.json());
    server.use(express.urlencoded({ extended: true }));

    const apiRouter = express.Router();
    require("./src/routes/auth")(apiRouter, fireStoreProvider, authRequired, cookieOptions);
    require("./src/routes/bots")(apiRouter, fireStoreProvider, authRequired);
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
  } catch (error) {
    console.log("App error: ", error);
  }
} else {
  const state = new LocalState("cli-state");
  state.update({ [pair]: {} });

  const kraken = new KrakenExchangeProvider(require("./.env.json").KRAKEN_CREDENTIALS, state);
  const info = { capital, investment, priceChange, strategyRange, safetyTimeline };
  const trader = new DailyTrader(kraken, pair, info);

  trader.listener = (pair, event, info) => {
    if (event == "buy") state.addBotOrder(pair, info);
    else if (event == "sell") state.removeBotOrder(pair, info);
    else if (event == "log") console.log(pair, info);
  };

  trader.start(timeInterval);

  // Command example:
  // node main.js ALPHAEUR 100 10 1.5 0.5 2
  // node main.js ADXEUR 100 10 1.5 0.5 2
  // node main.js SOLEUR 100 10 1.5 0.5 2
}
