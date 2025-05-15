// ===== Parse cookies =====
export function cookiesParser(request, response, next) {
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
export async function isAuthenticated(request, response, next, firestore, cookieOptions) {
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
