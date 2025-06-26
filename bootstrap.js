import { readFileSync } from "fs";
import { URL } from "url";

const jsonRequire = (path) => {
  return JSON.parse(readFileSync(new URL(path, `file://${process.cwd()}/`), "utf8"));
};

global.jsonRequire = jsonRequire; // Make it globally available (like require)
