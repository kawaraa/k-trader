import { parseError } from "../utilities.js";
import LocalState from "../local-state.js";
import notificationProvider from "../providers/notification-provider.js";
const notificationState = new LocalState("notification-subscriptions");

const notificationRoute = (router, authRequired, production) => {
  // Get bots
  router.get("/notification", authRequired, async (request, response) => {
    try {
      response.json(notificationState.load().map((sub) => sub.endpoint));
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.get("/notification/test", authRequired, async (request, response) => {
    try {
      const subscriptions = notificationState.load();
      if (subscriptions.length === 0) return response.status(400).json({ message: "No subscriptions found" });

      const result = await notificationProvider.push({
        title: "Test Notification from K-trader!",
        body: "Push Notification works fine.",
      });

      if (result) response.json({ success: true });
      else response.status(500).json({ message: "Failed to send push: " + err.message });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  // Create bot
  router.post("/notification", authRequired, async (request, response) => {
    try {
      const data = request.body;
      const subscriptions = notificationState.load();
      const not = subscriptions.find((sub) => sub.endpoint == data.endpoint);

      if (!not) {
        subscriptions.push(data);
        notificationState.update(subscriptions);
      }

      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  router.delete("/notification", authRequired, async (request, response) => {
    try {
      const { endpoint } = request.query;
      notificationState.update(notificationState.load().filter((sub) => sub.endpoint != endpoint));
      response.json({ success: true });
    } catch (error) {
      response.status(500).json({ message: parseError(error) });
    }
  });

  return router;
};

export default notificationRoute;
