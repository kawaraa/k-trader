// block-malicious-requests.js
const blockedIPs = new Map();

// Express identifies an error-handling middleware by the presence of all four arguments. Without next, it won't be treated as a middleware.
const errorHandlerMiddleware = (error, req, res, next) => {
  const clientIP = request.ip || request.connection.remoteAddress;
  console.log("errorHandlerMiddleware: ", clientIP, req.url, error);

  let statusCode = 500;
  let message = "Internal Server Error";

  res.status(statusCode).json({ message: "" });
};

export default errorHandlerMiddleware;
