import fs from "fs";
import path from "path";

// Synchronously loads environment variables from a .env file into process.env
function loadEnvSync(filePath = ".env") {
  try {
    // Resolve the full path
    const fullPath = path.resolve(process.cwd(), filePath);
    // Read the file content synchronously and Parse each line by handling both Unix and Windows line endings
    const lines = fs.readFileSync(fullPath, "utf-8").split(/\r?\n/);

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue; // Skip comments and empty lines

      // Split key and value (handling quoted values and inline comments)
      const match = line.match(/^([\w.-]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
      if (match) {
        let [_, key, value] = match;
        value = value.trim();
        // Remove surrounding quotes if present
        const singleQuotes = value.startsWith("'") && value.endsWith("'");
        const doubleQuotes = value.startsWith('"') && value.endsWith('"');
        if (singleQuotes || doubleQuotes) value = value.slice(1, -1);
        // Only set if not already in process.env
        if (process.env[key] === undefined) process.env[key] = value;
      }
    }

    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      console.warn(`No .env file found at ${filePath}`);
      return false;
    }
    console.error(`Error loading .env file: ${error.message}`);
    return false;
  }
}

export default loadEnvSync();
// Usage example:
// loadEnvSync(); // Loads .env in current directory
// console.log(process.env.MY_VARIABLE); // Access your variables
