import Controller from "./default.js";
import { existsSync } from "node:fs";

export default class SSEController extends Controller {
  constructor() {
    super();
  }

  // Get logs for pair
  get = async ({ params }, res, next) => {
    try {
      const pair = params.pair;
      const filePath = `${process.cwd()}/database/logs/${pair}.json`;
      if (!this.tradersManager.state.data[pair] || !existsSync(filePath)) return next("404-not found");
      // No logs data for ${pair} pair
      response.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  };
}
