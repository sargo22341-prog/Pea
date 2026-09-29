import assert from "node:assert/strict";
import test from "node:test";
import { buildScreenerQuery } from "../../repositories/screener/screener-query.js";

test("filter values are bound as named parameters, never written into the SQL", () => {
  const hostile = "Energy'; DROP TABLE assets; --";
  const { sql, params } = buildScreenerQuery({
    filters: { sector: hostile, country: "France", minDividendYield: 0.03, maxTrailingPE: 15, assetType: "stock" },
    sort: "dividendYield",
    direction: "desc"
  });

  assert.ok(!sql.includes("DROP TABLE"), "the hostile value stays out of the statement");
  assert.ok(!sql.includes("0.03") && !sql.includes("France"));
  assert.deepEqual(params, { sector: hostile, country: "France", minDividendYield: 0.03, maxTrailingPE: 15 });
  assert.match(sql, /dividend_yield >= @minDividendYield/);
  assert.match(sql, /trailing_pe > 0/, "a P/E filter excludes non meaningful multiples");
  assert.match(sql, /ORDER BY \(dividend_yield IS NULL\), dividend_yield DESC/);
});

test("without filters only the investable universe clause applies and missing values sort last", () => {
  const { sql, params } = buildScreenerQuery({ filters: {}, sort: "name", direction: "asc" });
  assert.deepEqual(params, {});
  assert.ok(!sql.includes("trailing_pe > 0"));
  assert.match(sql, /quote_type NOT IN \('INDEX'/);
  assert.match(sql, /ORDER BY \(name COLLATE NOCASE IS NULL\), name COLLATE NOCASE ASC, symbol ASC/);
});
