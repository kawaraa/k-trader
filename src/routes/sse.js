import express from "express";

export default (controller) => {
  const router = express.Router();
  router.get("/:pair/:filename", controller.get);
  return router;
};
