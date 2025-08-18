import { parseError } from "../../shared-code/utilities.js";

// Express identifies an error-handling middleware by the presence of all four arguments. Without next, it won't be treated as a middleware.
const errorHandlerMiddleware = (error, req, res, next) => {
  const clientIP =
    req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || req.ip || req.connection.remoteAddress;
  console.log(req.headers["x-real-ip"], req.headers["x-forwarded-for"], req.ip, req.connection.remoteAddress);
  console.log("errorHandlerMiddleware: ", clientIP, req.url, error);

  let statusCode = 500;
  let message = "Internal Server Error";
  const [type, msg] = (error?.message || error || "").split("-");

  if (type == "FORBIDDEN") {
    statusCode = 403;
    message = "Insufficient permission";
  } else {
    if (+type) {
      if (+type) statusCode = +type;
      message = msg;
    } else {
      message = parseError(error);
    }
  }

  res.status(statusCode).json({ message });
};

export default errorHandlerMiddleware;
