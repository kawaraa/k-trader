import webPush from "web-push"; // npm i web-push
const { NEXT_PUBLIC_HOST, NEXT_PUBLIC_VAPID_KEY, PRIV_VAPID_KEY, PUSH_NOTIFICATION_CONTACT_IDENTIFIER } =
  jsonRequire(".env.json");
import LocalState from "../services/local-state.js";

class NotificationProvider {
  constructor(state, webPush) {
    this.notificationState = state;
    this.webPush = webPush;
    // VAPID keys (generate with `web-push generate-vapid-keys`)
    this.webPush.setVapidDetails(
      `mailto:${PUSH_NOTIFICATION_CONTACT_IDENTIFIER}`,
      NEXT_PUBLIC_VAPID_KEY,
      PRIV_VAPID_KEY
    );
  }

  async push(payload) {
    const subscriptions = this.notificationState.load();
    payload.url = NEXT_PUBLIC_HOST + (payload.url || "");
    const data = JSON.stringify(payload);

    const responses = await Promise.all(subscriptions.map((sub, i) => this.send(sub, i, data)));
    const errors = responses.filter((response) => response != "success");
    if (!errors[0]) return true;
    // Clean up expired/failed subscriptions:
    errors.forEach((err) => err.statusCode === 410 && subscriptions.splice(err.subscriptionIndex, 1));

    console.error("Error sending push:", errors);
    return false;
  }

  send = async (sub, i, payload) => {
    try {
      await this.webPush.sendNotification(sub, payload);
      return "success";
    } catch (error) {
      error.subscriptionIndex = i;
      return error;
    }
  };
}

export default new NotificationProvider(new LocalState("notification-subscriptions"), webPush);
