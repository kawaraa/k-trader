import Controller from "./default.js";

export default class SSEController extends Controller {
  constructor() {
    super();
  }

  // Get bot prices history
  get = async ({ params }, res, next) => {
    try {
      const pair = params.pair;
      if (!this.tradersManager.state.data[pair] || !existsSync(filePath)) next("404-not found");
      // No prices data for ${pair} pair
      response.sendFile(`${process.cwd()}/database/prices/${pair}.json`);
    } catch (error) {
      next(error);
    }
  };
}
