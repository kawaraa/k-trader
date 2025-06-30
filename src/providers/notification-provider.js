import webPush from "web-push"; // npm i web-push
const { NEXT_PUBLIC_HOST, NEXT_PUBLIC_VAPID_KEY, PRIV_VAPID_KEY, PUSH_NOTIFICATION_CONTACT_IDENTIFIER } =
  process.env;
import LocalState from "../services/local-state.js";

class NotificationProvider {
  constructor() {
    this.state = new LocalState("state");
    this.webPush = webPush;
    // VAPID keys (generate with `web-push generate-vapid-keys`)
    this.webPush.setVapidDetails(
      `mailto:${PUSH_NOTIFICATION_CONTACT_IDENTIFIER}`,
      NEXT_PUBLIC_VAPID_KEY,
      PRIV_VAPID_KEY
    );
  }

  async push(payload) {
    const subscriptions = this.state.data.notificationSubscriptions;
    // payload.url = NEXT_PUBLIC_HOST + (payload.url || "");
    payload.url = payload.url || "/";
    const data = JSON.stringify(payload);
    console.log(NEXT_PUBLIC_HOST, payload);
    const responses = await Promise.all(subscriptions.map((sub, i) => this.send(sub, i, data)));
    const errors = responses.filter((response) => response != "success");
    if (!errors[0]) return null;

    // Clean up expired/failed subscriptions:
    errors.forEach((err) => err.statusCode === 410 && subscriptions.splice(err.subscriptionIndex, 1));
    // console.error("Error sending push:", errors);
    return errors;
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

const notificationProvider = new NotificationProvider();

export default notificationProvider;
