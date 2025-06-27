import express from "express";
// import fileParser from "../middlewares/file-parser.js";
// import paginationParser from "../middlewares/pagination-parser.js";

// const validatePost = (req, res, next) => {
//   next();
// };

export default (controller) => {
  const router = express.Router();
  router.get("/", controller.get);
  // router.post("/", controller.create);
  router.put("/update/:pair/:capital", controller.update); // change status / pause / turn on off
  router.patch("/buy/:pair/:eur", controller.buy);
  router.delete("/sell/:pair", controller.sell);
  return router;
};
