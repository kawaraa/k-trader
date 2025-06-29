import AuthController from "../controllers/auth.js";
import express from "express";
import authMiddleware from "../middlewares/auth.js";

const failureAttempts = new Map();
const lockedInPeriod = 1 * 60 * 60 * 1000;

const validateIncomingRequest = async (req, res, next) => {
  const user = { ipAddress: req.ip || req.connection.remoteAddress, agent: req.get("User-Agent") };
  const request = failureAttempts.get(user.ipAddress);
  req.user = user;
  if (request && request.attempts > 3 && Date.now() - request.lockedUntil < 0) {
    return next("TOO_MANY_REQUESTS-Too many attempts, please try again later.");
  }
  next();
};

const catchFailingAttempts = async (err, { user }, res, next) => {
  const request = failureAttempts.get(user.ipAddress);
  if (!request) failureAttempts.set(user.ipAddress, { attempts: 1 });
  else if (request.attempts > 3) request.lockedUntil = Date.now() + lockedInPeriod;
  else request.attempts++;
  next(err);
};

const getSubRoute = (entity) => {
  const router = express.Router();
  const controller = new AuthController(entity);
  router.use(validateIncomingRequest);
  // router.post("/register", controller.register);
  router.post("/", controller.login);
  router.get("/user", authMiddleware, controller.get);
  router.get("/", controller.logout);
  router.patch("/", controller.hash);
  router.use(catchFailingAttempts);

  return router;
};
export default getSubRoute;
