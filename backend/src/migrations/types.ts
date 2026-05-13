import type { DatabaseAdapter } from "../db-adapter.js";

export interface Migration {
  version: number;
  description: string;
  appliquer: (db: DatabaseAdapter) => void;
}

export interface ColonneDb {
  name: string;
  type: string;
}
