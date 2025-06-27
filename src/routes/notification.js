import express from "express";

const getSubRoute = (controller) => {
  const router = express.Router();
  router.get("/:pair", controller.get);
  router.post("/:pair", controller.subscribe);
  router.delete("/:pair", controller.unsubscribe);
  router.get("/test/:pair", controller.test);

  return router;
};
export default getSubRoute;
