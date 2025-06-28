import Controller from "./default.js";

export default class TraderController extends Controller {
  constructor() {
    super();
  }

  get = async (req, res, next) => {
    try {
      const data = { traders: {} };
      Object.keys(this.tradersManager.state.data).forEach((pair) => {
        const { state, balances } = this.tradersManager;
        data.traders[pair] = { ...state.data[pair], balance: balances[pair] };
        if (isNaN(data.eurBalance)) data.eurBalance = balances.eur;
      });

      res.json(data);
    } catch (error) {
      next(error);
    }
  };

  update = async ({ params }, res, next) => {
    try {
      if (pair == "ALL") {
        this.tradersManager.defaultCapital = +params.capital;
      } else if (this.tradersManager.state.data[params.pair]) {
        this.tradersManager.state.data[params.pair] = +params.capital;
      } else {
        throw new Error(`Unsupported cryptocurrency pair: ${params.pair}`);
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  buy = async ({ params }, res, next) => {
    try {
      await tradersManager.buy(params.pair, params.eur);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  sell = async ({ params }, res, next) => {
    try {
      await tradersManager.sellAll(params.pair);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
