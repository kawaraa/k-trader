import express from "express";
// import fileParser from "../middlewares/file-parser.js";
// import paginationParser from "../middlewares/pagination-parser.js";

// const validatePost = (req, res, next) => {
//   next();
// };

const getSubRoute = (controller) => {
  const router = express.Router();
  router.get("/", controller.get);
  router.post("/enable-disable/:pair", controller.enableDisable);
  router.put("/update/capital/:pair/:value", controller.updateCapital); // change status / pause / turn on off
  router.put("/update/trades/:pair/", controller.resetTrades);
  router.put("/update/command/:pair/", controller.setCommand);
  router.put("/auto-sell/:pair/:status", controller.autoSell);
  router.patch("/:action/:pair/", controller.execute);
  return router;
};
export default getSubRoute;
