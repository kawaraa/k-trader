import "./bootstrap.js";
import "./src/config/load-env.js";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoSanitize from "express-mongo-sanitize";
import xss from "xss-clean";
import authRoute from "./src/routes/auth.js";
import apiRoutes from "./src/routes/api.js";
import errorHandlerMiddleware from "./src/middlewares/error.js";
import authMiddleware from "./src/middlewares/auth.js";
import { RequestRateLimiter } from "k-utilities/express-middleware.js";
import tradersManager from "./src/traders/traders-manager.js";

const port = process.env.PORT || 3000;
const methods = process.env.ALLOWED_METHODS || "GET,PUT,POST,DELETE";
const origin = process.env.CORS_ORIGIN || "*";
// const prod = process.env.NODE_ENV === "production";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();

mkdirSync("database/logs", { recursive: true });
mkdirSync("database/prices", { recursive: true });

app.set("trust proxy", true);
// Apply the rate limiter middleware to all routes for Prevent brute-force attacks
app.use(new RequestRateLimiter(1, 100).limitRate);

app.use(cookieParser());

// Security middleware
app.use(
  helmet({
    // Allow inline scripts for next.js app
    contentSecurityPolicy: { directives: { scriptSrc: ["'self'", "'unsafe-inline'", origin] } },
  })
);
app.use(cors({ origin, methods, credentials: false }));

// Request parsing
app.use(express.json({ limit: "1200kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// app.use(cookieParser(process.env.JWT_SECRET)); // when set the cooke: {signed: true}

// Data sanitization
app.use(mongoSanitize());
app.use(xss());

// Routes
// app.use("/api", new RequestRateLimiter(1, 150).limitRate);
app.use("/api/auth", authRoute());
app.use("/api", authMiddleware, apiRoutes);
app.use(express.static(`${__dirname}/public/`)); // Serve static files from the "out" directory
app.use(express.static(`${__dirname}/out/`)); // SPA behavior: (Serve the index.html for any unknown routes)
// app.get("*", (req, res) => res.sendFile(`${__dirname}/out/index.html`));
app.use("/*", (req, res, next) => next("NOT_FOUND"));
app.use(errorHandlerMiddleware);

app.listen(port, (error) => {
  if (!error) return console.log(`Server running on http://localhost:${port}`);
  console.log("Failed to start server:", error);
  process.exit(1);
});

tradersManager.start();
