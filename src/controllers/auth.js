import Controller from "./default.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const secure = process.env.NODE_ENV === "production";
const secret = process.env.JWT_SECRET;
const maxAge = 8 * 60 * 60 * 1000; // expires in 8hrs
// const maxAge = 60 * 60 * 24 * 7; // 1 week (weekSec)
// const maxAge = 30 * 24 * 3600 * 1000; // 30 days

export default class AuthController extends Controller {
  constructor() {
    super();
  }

  // register = async ({ body }, res, next) => {
  //   try {
  //     body.password = await bcrypt.hash(body.password, 10);
  //     const newUser = new User(body);
  //     res.json({ data: newUser });
  //   } catch (error) {
  //     next(error);
  //   }
  // };

  login = async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const state = this.mainState.load();
      const user = state[username];
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) return next("UNAUTHORIZED");
      delete user.passwordHash;
      const token = jwt.sign(user, secret, { expiresIn: maxAge });
      res.cookie("accessToken", token, { httpOnly: true, secure, maxAge, sameSite: "strict" }); //sameSite: "lax"
      res.json({ accessToken: token });
    } catch (error) {
      next(error);
    }
  };

  logout = async (req, res) => {
    res.cookie("accessToken", null, { httpOnly: true, secure, sameSite: "strict", path: "/", maxAge });
    res.clearCookie("idToken");
    res.json({ success: true });
  };

  hash = async (req, res) => {
    res.json({ hash: await bcrypt.hash(req.params.password, 10) });
  };
}
