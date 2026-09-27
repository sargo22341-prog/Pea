import BetterSqlite3, { type Database as BetterSqliteDatabase, type Statement } from "better-sqlite3";

/**
 * Nombre maximal de requetes preparees conservees. Les requetes du code sont quasi toutes
 * statiques ; la borne protege des SQL construits dynamiquement (listes `IN (?, ?, ...)`).
 */
const maxCachedStatements = 500;

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
  private statements = new Map<string, PreparedStatement>();

  constructor(filePath: string) {
    this.database = new BetterSqlite3(filePath);
    this.database.pragma("journal_mode = WAL");
    this.database.pragma("foreign_keys = ON");
    this.database.pragma("busy_timeout = 5000");
  }

  exec(sql: string) {
    this.database.exec(sql);
  }

  /**
   * Prepare une requete une seule fois puis la reutilise : la compilation SQL coute plus cher
   * que l'execution des lectures courtes. SQLite recompile seul une requete apres un changement
   * de schema. Les requetes les plus anciennes sont evincees au-dela de la borne.
   */
  prepare(sql: string) {
    const cached = this.statements.get(sql);
    if (cached) {
      this.statements.delete(sql);
      this.statements.set(sql, cached);
      return cached;
    }
    const statement = new PreparedStatement(this.database.prepare(sql));
    this.statements.set(sql, statement);
    if (this.statements.size > maxCachedStatements) {
      const oldest = this.statements.keys().next().value;
      if (oldest !== undefined) this.statements.delete(oldest);
    }
    return statement;
  }

  cachedStatementCount() {
    return this.statements.size;
  }

  close() {
    this.statements.clear();
    this.database.close();
  }

  transaction<T>(fn: () => T): T {
    return this.database.transaction(fn)();
  }
}
