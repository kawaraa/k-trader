import Controller from "./default.js";

export default class TraderController extends Controller {
  constructor() {
    super();
  }

  get = async (req, res, next) => {
    try {
      const { state, balances, autoSell } = this.tradersManager;
      const data = { traders: {}, defaultCapital: this.tradersManager.defaultCapital, autoSell };
      Object.keys(this.tradersManager.state.data).forEach((pair) => {
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
      if (params.pair == "ALL") {
        this.tradersManager.defaultCapital = +params.capital;
        if (!+params.capital || +params.capital <= 0) {
          for (const pair in this.tradersManager.state.data) {
            this.tradersManager.state.data[pair].capital = 0;
          }
          this.tradersManager.state.update(this.tradersManager.state.data);
        }
      } else if (this.tradersManager.state.data[params.pair]) {
        this.tradersManager.state.data[params.pair].capital = +params.capital || 0;
        this.tradersManager.state.update(this.tradersManager.state.data);
      } else {
        throw new Error(`Unsupported cryptocurrency pair: ${params.pair}`);
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  autoSell = async ({ params }, res, next) => {
    try {
      if (params.pair == "ALL") {
        this.tradersManager.autoSell = params.status == "on";
      } else if (this.tradersManager.state.data[params.pair]) {
        // this.tradersManager.state.data[params.pair].capital = +params.capital || 0;
        // this.tradersManager.state.update(this.tradersManager.state.data);
      } else {
        throw new Error(`Unsupported cryptocurrency pair: ${params.pair}`);
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  execute = async ({ params }, res, next) => {
    try {
      if (params.action == "buy") await this.tradersManager.buy(params.pair);
      else await this.tradersManager.sell(params.pair);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };
}
