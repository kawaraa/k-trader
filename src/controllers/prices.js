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
      const filePath = `${process.cwd()}/database/prices/${pair}`;
      if (!existsSync(filePath)) return next("404-Not found"); // No prices data for ${pair} pair
      if (!(+query.since && +query.interval)) return res.sendFile(filePath);

      res.json(await this.state.getLocalPrices(pair, parseInt((+query.since * 60 * 60) / query.interval)));
      if (query.live) this.eventEmitter.emit(`add-pair`, [clientIP, pair]);
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
