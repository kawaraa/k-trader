import LocalState from "../services/local-state.js";
import eventEmitter from "../services/event-emitter.js";
import tradersManager from "../traders/traders-manager.js";
import notificationProvider from "../providers/notification-provider.js";

export default class DefaultController {
  constructor() {
    this.origin = process.env.CORS_ORIGIN || "*";
    this.state = new LocalState("state");
    this.eventEmitter = eventEmitter;
    this.tradersManager = tradersManager;
    this.notificationProvider = notificationProvider;
  }
}
