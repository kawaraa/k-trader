import Controller from "./default.js";
const errMsg = (pair) => `400-Unsupported cryptocurrency pair: ${pair}`;

export default class TraderController extends Controller {
  constructor() {
    super();
  }

  get = async (req, res, next) => {
    try {
      const { state, eurBalance, defaultCapital, autoSell } = this.tradersManager;
      res.json({ eurBalance, traders: state.data, defaultCapital, autoSell });
    } catch (error) {
      next(error);
    }
  };

  enableDisable = async ({ params: { pair } }, res, next) => {
    try {
      if (!this.tradersManager.state.data[pair]) return next(errMsg(pair));
      this.tradersManager.state.data[pair].disabled = !this.tradersManager.state.data[pair].disabled;

      this.tradersManager.state.update(this.tradersManager.state.data);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  update = async ({ params: { pair, capital } }, res, next) => {
    try {
      if (pair == "ALL") {
        this.tradersManager.defaultCapital = +capital;
        if (!+capital || +capital <= 0) {
          for (const pair in this.tradersManager.state.data) {
            this.tradersManager.state.data[pair].capital = 0;
          }
          this.tradersManager.state.update(this.tradersManager.state.data);
        }
      } else if (this.tradersManager.state.data[pair]) {
        this.tradersManager.state.data[pair].capital = +capital || 0;
        this.tradersManager.state.update(this.tradersManager.state.data);
      } else {
        return next(errMsg(pair));
      }
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  autoSell = async ({ params: { pair, status } }, res, next) => {
    try {
      if (pair == "ALL") {
        this.tradersManager.autoSell = status == "on";
      } else if (this.tradersManager.state.data[pair]) {
        // this.tradersManager.state.data[pair].capital = status == "on";
        // this.tradersManager.state.update(this.tradersManager.state.data);
      } else {
        return next(errMsg(pair));
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
