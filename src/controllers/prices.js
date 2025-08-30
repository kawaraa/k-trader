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
      const filePath = `${process.cwd()}/database/prices/${pair}`;
      if (!existsSync(filePath)) return next("404-Not found"); // No prices data for ${pair} pair
      if (!(+query.since && +query.interval)) return res.sendFile(filePath);

      res.json(await this.state.getLocalPrices(pair, parseInt((+query.since * 60 * 60) / query.interval)));
    } catch (error) {
      next(error);
    }
  };
}
