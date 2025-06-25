import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import express from "express";
import { cookiesParser, isAuthenticated } from "./src/routes/middlewares.js";
import authRoute from "./src/routes/auth.js";
import botRoute from "./src/routes/bots.js";
import notificationRoute from "./src/routes/notification.js";
import { RequestRateLimiter } from "k-utilities/network.js";
import fireStoreProvider from "./src/providers/firebase-provider.js";
import BotsManager from "./src/a-bots-manager.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

mkdirSync("database/logs", { recursive: true });
mkdirSync("database/prices", { recursive: true });

const prod = process.env.NODE_ENV === "production";
const port = process.env.PORT || 3000;
// const methods = process.env.ALLOWED_METHODS || "GET,PUT,POST,DELETE";
// const origin = process.env.CORS_ORIGIN || "*";
const server = express();

// const maxAge = 60 * 60 * 24 * 7; // 1 week (weekSec)
const maxAge = 30 * 24 * 3600 * 1000; // 30 days
const cookieOptions = { httpOnly: true, secure: prod, maxAge, path: "/", sameSite: "lax" }; // strict
const authRequired = (...args) => isAuthenticated(...args, fireStoreProvider, cookieOptions);

try {
  // Apply the rate limiting all requests by adding rate limiter middleware to all routes
  // app.use(cors({ origin, methods, credentials: false }));
  server.use(new RequestRateLimiter(1, 100).limitRate);
  server.use(cookiesParser);
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));

  const apiRouter = express.Router();
  authRoute(apiRouter, fireStoreProvider, authRequired, cookieOptions);
  botRoute(apiRouter, fireStoreProvider, authRequired, prod);
  notificationRoute(apiRouter, authRequired, prod);

  server.use("/api", apiRouter);

  server.use(express.static(`${__dirname}/public/`)); // Serve static files from the "out" directory
  server.use(express.static(`${__dirname}/out/`)); // SPA behavior: (Serve the index.html for any unknown routes)

  server.get("*", (req, res) => {
    res.sendFile(`${__dirname}/out/index.html`);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`Server is running on http://localhost:${port}`);
  });

  const botsManager = new BotsManager();
  botsManager.start();
} catch (error) {
  console.log("App error: ", error);
}
