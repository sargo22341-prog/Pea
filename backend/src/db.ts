import { createDatabaseConnection } from "./db-connection.js";
import { initializeSchema } from "./db-schema.js";

export const db = createDatabaseConnection();

initializeSchema(db);
