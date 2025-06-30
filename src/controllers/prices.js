import Controller from "./default.js";
import { existsSync, readFileSync } from "node:fs";

export default class SSEController extends Controller {
  constructor() {
    super();
  }

  // Get bot prices history
  get = async ({ connection, ip, params, query }, res, next) => {
    try {
      const clientIP = ip || connection.remoteAddress;
      const pair = params.pair;
      const filePath = `${process.cwd()}/database/prices/${pair}.json`;
      if (!this.tradersManager.state.data[pair] || !existsSync(filePath)) return next("404-not found");
      // No prices data for ${pair} pair
      if (!(+query.since && +query.interval)) return res.sendFile(filePath);
      const length = parseInt((+query.since * 60 * 60) / query.interval);
      res.json(JSON.parse(readFileSync(filePath, "utf8")).slice(-length));
      this.eventEmitter.emit(`add-pair`, [clientIP, pair]);
    } catch (error) {
      next(error);
    }
  };

  removePriceEvent = (request, response, next) => {
    try {
      const clientIP = request.ip || request.connection.remoteAddress;
      this.eventEmitter.emit(`remove-pair`, [clientIP, request.params.pair]);
      response.json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
