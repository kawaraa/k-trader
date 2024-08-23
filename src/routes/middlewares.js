// ===== throttling-technique =====
const requestCounts = new Map();
// Define the rate limit parameters
const WINDOW_SIZE = 60 * 1000; // 1 minute
const MAX_REQUESTS = 120; // or 60 which mean a request per second

function rateLimiter(request, response, next) {
  const clientIp = request.ip; // Get client's IP address
  const newRequestData = { count: 1, timestamp: Date.now() };
  const requestData = requestCounts.get(clientIp);

  if (!requestData) requestCounts.set(clientIp, newRequestData);
  else {
    const exceededTheMaximum = newRequestData.timestamp - requestData.timestamp < WINDOW_SIZE;
    requestData.count++;

    if (requestData.count > MAX_REQUESTS && exceededTheMaximum) {
      // If the request count exceeds the maximum, send a 429 response
      return response.status(429).send("Too many requests, please try again later.");
    } else {
      // If the time window has elapsed, reset the request count
      requestCounts.set(clientIp, requestData);
    }
  }

  // Continue to the next middleware or route handler
  next();
}

// ===== Parse cookies =====
function cookiesParser(request, response, next) {
  const cookies = request.headers.cookie
    ? request.headers.cookie.split("; ").reduce((prev, current) => {
        const [name, value] = current.split("=");
        prev[name] = value;
        return prev;
      }, {})
    : {};
  request.cookies = cookies;
  next();
}

// ===== Authentication =====
async function isAuthenticated(request, response, next, firestore, cookieOptions) {
  try {
    const { idToken, refreshToken } = request.cookies;
    if (!idToken || !refreshToken) throw new Error("Unauthorized");

    const result = await firestore.testAuthentication(idToken).catch((er) => er.message);
    if (result.includes && result?.includes("invalid authentication")) {
      const tokens = await firestore.refreshToken(refreshToken);
      await firestore.testAuthentication(tokens.idToken);
      response.cookie("idToken", tokens.idToken, cookieOptions);
      response.cookie("refreshToken", tokens.refreshToken, cookieOptions);
    }

    next();
  } catch (error) {
    response.clearCookie("idToken");
    response.clearCookie("refreshToken");
    response.status(401).json({ message: "Unauthorized" });
  }
}

module.exports = { rateLimiter, cookiesParser, isAuthenticated };
