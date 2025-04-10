const { mkdirSync } = require("node:fs");
const express = require("express");
const { rateLimiter, cookiesParser, isAuthenticated } = require("./src/routes/middlewares.js");
const fireStoreProvider = require("./src/providers/firebase-provider");

mkdirSync("database/logs", { recursive: true });
mkdirSync("database/prices", { recursive: true });

const prod = process.env.NODE_ENV === "production";
const port = 3000;
const server = express();

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
