import express from "express";

const getSubRoute = (controller) => {
  const router = express.Router();
  router.get("/:pair", controller.listen);
  router.patch("/:pair", controller.removeListener);
  return router;
};

export default getSubRoute;
