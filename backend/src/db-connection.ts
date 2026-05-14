import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { DatabaseAdapter } from "./db-adapter.js";

export function createDatabaseConnection(): DatabaseAdapter {
  const directory = path.dirname(config.sqlitePath);
  if (directory && directory !== ".") {
    fs.mkdirSync(directory, { recursive: true });
  }

  return new DatabaseAdapter(config.sqlitePath);
}
