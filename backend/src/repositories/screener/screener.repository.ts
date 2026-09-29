import { db } from "../../db.js";
import { SCREENER_OPTIONS_SQL, type ScreenerSql } from "./screener-query.js";

export interface ScreenerDbRow {
  symbol: string;
  name: string;
  quote_type: string;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  country: string | null;
  price: number | null;
  market_cap: number | null;
  trailing_pe: number | null;
  dividend_yield: number | null;
  change_52w: number | null;
  distance_from_high: number | null;
}

export const screenerRepository = {
  run(query: ScreenerSql) {
    return db.prepare(query.sql).all(query.params) as ScreenerDbRow[];
  },

  options() {
    const values = (sql: string) => (db.prepare(sql).all() as { value: string }[]).map((row) => row.value);
    return { sectors: values(SCREENER_OPTIONS_SQL.sectors), countries: values(SCREENER_OPTIONS_SQL.countries) };
  }
};
