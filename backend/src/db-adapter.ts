import BetterSqlite3, { type Database as BetterSqliteDatabase, type Statement } from "better-sqlite3";

class PreparedStatement {
  constructor(private statement: Statement) {}

  get(...params: unknown[]) {
    return this.statement.get(...params);
  }

  all(...params: unknown[]) {
    return this.statement.all(...params);
  }

  run(...params: unknown[]) {
    return this.statement.run(...params).changes;
  }
}

export class DatabaseAdapter {
  private database: BetterSqliteDatabase;

  constructor(filePath: string) {
    this.database = new BetterSqlite3(filePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
  }

  exec(sql: string) {
    this.database.exec(sql);
  }

  prepare(sql: string) {
    return new PreparedStatement(this.database.prepare(sql));
  }

  transaction<T>(fn: () => T): T {
    return this.database.transaction(fn)();
  }
}
