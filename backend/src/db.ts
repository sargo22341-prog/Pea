import fs from "node:fs";
import { config } from "./config.js";
import { createDatabaseConnection } from "./db-connection.js";
import { initializeSchema } from "./db-schema.js";

export const db = createDatabaseConnection();

initializeSchema(db);

const isolatedTestDataDir = config.isolatedTestDataDir;
if (isolatedTestDataDir) {
  process.once("exit", () => {
    db.close();
    fs.rmSync(isolatedTestDataDir, { recursive: true, force: true });
  });
}
