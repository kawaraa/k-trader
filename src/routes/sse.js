import express from "express";

const getSubRoute = (controller) => {
  const router = express.Router();
  router.get("/:pair/:filename", controller.get);
  // router.post("/:pair/:filename", controller.add);
  // router.delete("/:pair/:filename", controller.remove);
  return router;
};

export default getSubRoute;
