import Controller from "./default.js";
import { existsSync, readFileSync } from "node:fs";

export default class SSEController extends Controller {
  constructor() {
    super();
  }

  // Get bot prices history
  get = async ({ params, query }, res, next) => {
    try {
      const pair = params.pair;
      const filePath = `${process.cwd()}/database/prices/${pair}.json`;
      if (!this.tradersManager.state.data[pair] || !existsSync(filePath)) return next("404-not found");
      // No prices data for ${pair} pair
      if (!(+query.since && +query.interval)) return res.sendFile(filePath);
      res.json(
        JSON.parse(readFileSync(filePath, "utf8")).slice(
          -parseInt((+query.since * 60 * 60) / +query.interval)
        )
      );
    } catch (error) {
      next(error);
    }
  };
}
