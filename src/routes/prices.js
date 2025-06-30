import express from "express";

const getSubRoute = (controller) => {
  const router = express.Router();
  router.get("/:pair", controller.get);
  router.patch("/event/:pair", controller.removePriceEvent);
  return router;
};

export default getSubRoute;
