import Controller from "./default.js";

export default class NotificationController extends Controller {
  constructor() {
    super();
  }

  get = async (req, res, next) => {
    try {
      res.json(this.mainState.data.notificationSubscriptions.map((sub) => sub.endpoint));
    } catch (error) {
      next(error);
    }
  };

  subscribe = async (req, res, next) => {
    try {
      const data = request.body;
      const not = this.mainState.data.notificationSubscriptions.find((sub) => sub.endpoint == data.endpoint);
      if (!not) {
        this.mainState.data.notificationSubscriptions.push(data);
        this.mainState.update(this.mainState.data);
      }

      response.json({ success: true });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  unsubscribe = async ({ query }, res, next) => {
    try {
      const { endpoint } = query;
      const notSub = this.mainState.data.notificationSubscriptions.filter((sub) => sub.endpoint != endpoint);
      this.mainState.data.notificationSubscriptions = notSub;
      this.mainState.update(this.mainState.data);
      response.json({ success: true });
    } catch (error) {
      next(error);
    }
  };

  test = async (req, res, next) => {
    try {
      const subscriptions = this.mainState.data.notificationSubscriptions;
      if (subscriptions.length === 0) return next("400-No subscriptions found");
      const result = await this.notificationProvider.push({
        title: "Test Notification from K-trader!",
        body: "Push Notification works fine.",
        url: "/",
      });

      if (result) response.json({ success: true });
      else response.status(500).json({ message: "Failed to send push: " + err.message });
    } catch (error) {
      next(error);
    }
  };
}
