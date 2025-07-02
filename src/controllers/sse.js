import Controller from "./default.js";

export default class SSEController extends Controller {
  constructor() {
    super();
    this.activeConnections = new Map();
    this.eventEmitter.on("add-pair", (x) => this.#addEvent(...x));
    this.eventEmitter.on("remove-pair", (x) => this.#removeEvent(...x));

    // setInterval(() => {
    //   console.log(this.activeConnections);
    //   this.eventEmitter.emit("price", { PEPEEUR: [0.00008333, 0.00008348, 0.00008341, 4636] });
    //   this.eventEmitter.emit(`PEPEEUR-log`, { log: "Test log" });
    // }, 10000);
  }

  get = async (request, response, next) => {
    try {
      const clientIP = request.ip || request.connection.remoteAddress;
      let event = request.params.filename;

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
        if (response.writableEnded || response.destroyed) return; // Cannot send, client is gone
        response.write(`data: ${JSON.stringify(data)}\n\n`); //data and \n\n are REQUIRED
      };

      const eventHandler = (data) => {
        if (data.log) return sendEvent(data);
        if (this.activeConnections.get(clientIP)?.has(Object.keys(data)[0])) sendEvent(data);
      };

      this.eventEmitter.on(event, eventHandler);

      request.on("error", (error) => {
        console.log("SSE request error", error);
        this.eventEmitter.off(event, eventHandler);
        this.#removeEvent(clientIP, event);
        response.end();
      });
      request.on("close", () => {
        console.log("client disconnect");
        this.eventEmitter.off(event, eventHandler);
        this.#removeEvent(clientIP, event);
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
  #removeEvent(clientIP, eventName) {
    if (eventName == "all") return this.activeConnections.delete(clientIP);
    const clientEvents = this.activeConnections.get(clientIP);
    if (clientEvents) {
      clientEvents.delete(eventName);
      if (clientEvents.size === 0) this.activeConnections.delete(clientIP);
    }
  }
  #addEvent(clientIP, eventName) {
    const client = this.activeConnections.get(clientIP);
    if (client && !client.has(eventName)) client.set(eventName);
  }
}
