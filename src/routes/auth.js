const { parseError } = require("../utilities");

module.exports = (router, fireStoreProvider, authRequired, cookieOptions) => {
  // Check if signed in
  router.get("/auth", authRequired, async (request, response) => {
    response.status(200).json({ message: "already signed in" });
  });

  // Sign in
  router.post("/auth", async (request, response) => {
    try {
      const { email, password } = request.body;
      const { idToken, refreshToken } = await fireStoreProvider.signin(email, password);
      response.cookie("idToken", idToken, cookieOptions);
      response.cookie("refreshToken", refreshToken, cookieOptions);
      response.status(200).json({ message: "Successfully signed in" });
    } catch (error) {
      response.status(401).json({ message: `Authentication failed: ${parseError(error)}` });
    }
  });

  // Sign out
  router.delete("/auth", async (request, response) => {
    // delete the token cookie, by setting the Set-Cookie header with the same cookie name and maxAge set to 0 or an expiration date in the past. This tells the browser to remove the cookie.
    try {
      await fireStoreProvider.signOut(request.cookies?.idToken);
      response.clearCookie("idToken");
      response.clearCookie("refreshToken");
      response.status(200).json({ message: "Successfully signed out" });
    } catch (error) {
      response.status(401).json({ message: `Authentication failed: ${parseError(error)}` });
    }
  });

  return router;
};
