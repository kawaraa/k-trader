import Controller from "./default.js";

export default class SSEController extends Controller {
  constructor() {
    super();
  }

  // Get logs for pair
  get = async ({ params }, res, next) => {
    try {
      const pair = params.pair;
      if (!this.tradersManager.state.data[pair] || !existsSync(filePath)) next("404-not found");
      // No logs data for ${pair} pair
      response.sendFile(`${process.cwd()}/database/logs/${pair}.json`);
    } catch (error) {
      next(error);
    }
  };
}
