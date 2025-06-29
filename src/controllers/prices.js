import Controller from "./default.js";
import { existsSync } from "node:fs";

export default class SSEController extends Controller {
  constructor() {
    super();
  }

  // Get bot prices history
  get = async ({ params }, res, next) => {
    try {
      const pair = params.pair;
      const filePath = `${process.cwd()}/database/prices/${pair}.json`;
      if (!this.tradersManager.state.data[pair] || !existsSync(filePath)) next("404-not found");
      // No prices data for ${pair} pair
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  };
}
