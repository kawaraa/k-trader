import jwt from "jsonwebtoken";
const secret = process.env.JWT_SECRET;

const authMiddleware = (req, res, next) => {
  try {
    const token = req.get("Authorization")?.replace("Bearer ", "") || req.cookies?.accessToken;
    if (!token) throw "Unauthenticated";
    req.user = jwt.verify(token, secret); // decoded Token contains the user info
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid authentication token" });
  }
};

export default authMiddleware;
