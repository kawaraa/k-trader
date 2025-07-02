import Controller from "./default.js";

export default class NotificationController extends Controller {
  constructor() {
    super();
  }

  get = async ({ query }, res, next) => {
    try {
      const { endpoint } = query;
      res.json({
        active: !!this.state.data.notificationSubscriptions.find((sub) => sub.endpoint == endpoint),
      });
    } catch (error) {
      next(error);
    }
  };

  subscribe = async (req, res, next) => {
    try {
      const data = req.body;
      const not = this.state.data.notificationSubscriptions.find((sub) => sub.endpoint == data.endpoint);
      if (!not) {
        this.state.data.notificationSubscriptions.push(data);
        this.state.update(this.state.data);
      }

      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  unsubscribe = async ({ query }, res, next) => {
    try {
      const { endpoint } = query;
      const notSub = this.state.data.notificationSubscriptions.filter((sub) => sub.endpoint != endpoint);
      this.state.data.notificationSubscriptions = notSub;
      this.state.update(this.state.data);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  test = async (req, res, next) => {
    try {
      const subscriptions = this.state.data.notificationSubscriptions;
      if (subscriptions.length === 0) return next("400-No subscriptions found");
      const errors = await this.notificationProvider.push({
        title: "Test Notification from K-trader!",
        body: "Push Notification works fine.",
        url: "/",
      });

      if (!errors) res.json({ success: true });
      else res.status(500).json({ message: "Failed to send push: " + JSON.stringify(errors) });
    } catch (error) {
      next(error);
    }
  };
}
