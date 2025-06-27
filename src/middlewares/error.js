import { parseError } from "../services/utilities";

// Express identifies an error-handling middleware by the presence of all four arguments. Without next, it won't be treated as a middleware.
const errorHandlerMiddleware = (error, req, res, next) => {
  console.log("errorHandlerMiddleware: ", error);

  let statusCode = 500;
  let message = "Internal Server Error";
  const [type, msg] = (error?.message || error || "").split("-");

  if (type == "FORBIDDEN") {
    statusCode = 403;
    message = "Insufficient permission";
  } else {
    if (+type) {
      statusCode = type;
      message = msg;
    } else {
      message = parseError(error);
    }
  }

  res.status(statusCode).json({ message });
};

export default errorHandlerMiddleware;
