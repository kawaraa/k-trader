import express from "express";
import defaultRoute from "./default.js";
import DefaultController from "../controllers/default.js";

const routePaths = ["/trader"];

async function addRoutes(router) {
  const route = { default: defaultRoute };
  const controller = { default: DefaultController };

  for (const routePath of routePaths) {
    const subRoutes = (await import(`.${routePath}.js`).catch(() => route)).default;
    const Controller = (await import(`../controllers${routePath}.js`).catch(() => controller)).default;
    const entity = routePath.replace("/", "").replaceAll("-", "_").toLowerCase();

    router.use(routePath, subRoutes(new Controller(entity)));
  }

  return router;
}

export default await addRoutes(express.Router());
