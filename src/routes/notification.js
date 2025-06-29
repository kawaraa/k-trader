import express from "express";

const getSubRoute = (controller) => {
  const router = express.Router();
  router.get("/", controller.get);
  router.post("/", controller.subscribe);
  router.delete("/", controller.unsubscribe);
  router.get("/test/", controller.test);

  return router;
};
export default getSubRoute;
