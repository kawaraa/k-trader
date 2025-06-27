import Controller from "./default.js";

export default class SSEController extends Controller {
  constructor() {
    super();
  }

  get = async (request, response, next) => {
    try {
      const { pair, filename } = request.params;

      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": request.headers.origin || origin, // Required for CORS
        "Access-Control-Allow-Credentials": "true", // Needed for withCredentials
      });

      const sendEvent = (data) => {
        response.write(`data: ${JSON.stringify(data)}\n\n`); //data and \n\n are REQUIRED
      };

      const priceEventHandler = (data) => {
        console.log("price Event received with data:", data);
        sendEvent(data);
      };
      const logEventHandler = (data) => {
        console.log("log Event received with data:", data);
        sendEvent(data);
      };

      if (filename == "log") {
        this.eventEmitter.off(`${pair}-log`, logEventHandler);
        this.eventEmitter.on(`${pair}-log`, logEventHandler);
      } else {
        this.eventEmitter.off(`${pair}-price`, priceEventHandler);
        this.eventEmitter.on(`${pair}-price`, priceEventHandler);
      }

      request.on("error", (error) => {
        console.log("SSE request error", error);
        if (!response.writableEnded) response.end();
      });
      request.on("close", () => {
        console.log("client disconnect");
        if (!response.writableEnded) response.end();
      });
    } catch (error) {
      next(error);
    }
  };
}
