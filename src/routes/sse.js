import express from "express";

const getSubRoute = (controller) => {
  const router = express.Router();
  router.get("/:pair/:filename", controller.get);
  return router;
};

export default getSubRoute;
