import express from "express";

const getSubRoute = (controller) => {
  const router = express.Router();
  router.get("/:pair", controller.get);
  return router;
};

export default getSubRoute;
