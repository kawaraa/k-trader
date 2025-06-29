import Controller from "./default.js";

export default class SSEController extends Controller {
  constructor() {
    super();
    this.activeConnections = new Map();
  }

  get = async (request, response, next) => {
    try {
      const clientIP = request.ip || request.connection.remoteAddress;
      let event = request.params.filename;
      console.log(request.params);

      if (event == "log") event = `${request.params.pair}-${event}`;
      this.#addConnection(clientIP, event);

      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": request.headers.origin || this.origin, // Required for CORS
        "Access-Control-Allow-Credentials": "true", // Needed for withCredentials
      });

      const sendEvent = (data) => {
        response.write(`data: ${JSON.stringify(data)}\n\n`); //data and \n\n are REQUIRED
      };

      const eventHandler = (data) => {
        console.log("New Event received with data:", data);
        sendEvent(data);
      };

      this.eventEmitter.on(event, eventHandler);

      request.on("error", (error) => {
        console.log("SSE request error", error);
        this.eventEmitter.off(event, eventHandler);
        this.#cleanupConnection(clientIP, event);
        response.end();
      });
      request.on("close", () => {
        console.log("client disconnect");
        this.eventEmitter.off(event, eventHandler);
        this.#cleanupConnection(clientIP, event);
        response.end();
      });
    } catch (error) {
      next(error);
    }
  };

  #addConnection(clientIP, eventName) {
    if (!this.activeConnections.has(clientIP)) this.activeConnections.set(clientIP, new Map());
    const clientEvents = this.activeConnections.get(clientIP);
    if (!clientEvents.has(eventName)) clientEvents.set(eventName);
    else throw new Error("400-Already listening to " + eventName + " event");
  }
  #cleanupConnection(clientIP, eventName) {
    const clientEvents = this.activeConnections.get(clientIP);
    if (clientEvents) {
      if (clientEvents.has(eventName)) clientEvents.delete(eventName);
      if (clientEvents.size === 0) this.activeConnections.delete(clientIP);
    }
  }
}
