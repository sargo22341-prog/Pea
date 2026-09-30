import { runBackendScript } from "../../helpers/backend-script.js";
import assert from "node:assert/strict";
import test from "node:test";

test("parseBoursoramaCsv parses a valid semicolon-delimited row", () => {
  const result = runBackendScript(`
    import { parseBoursoramaCsv } from "./services/boursorama/importBoursorama.service.ts";

    const csv = "Air Liquide;FR0000120073;10;150,00;155,50;0,50;1 555,00;5,00;3,67";
    const rows = parseBoursoramaCsv(csv);
    console.log("__RESULT__" + JSON.stringify({ count: rows.length, name: rows[0].name, isin: rows[0].isin, quantity: rows[0].quantity, errors: rows[0].errors }));
  `) as { count: number; name: string; isin: string; quantity: number; errors: unknown[] };

  assert.equal(result.count, 1);
  assert.equal(result.name, "Air Liquide");
  assert.equal(result.isin, "FR0000120073");
  assert.equal(result.quantity, 10);
  assert.deepEqual(result.errors, []);
});

test("parseBoursoramaCsv strips UTF-8 BOM from the start of the content", () => {
  const result = runBackendScript(`
    import { parseBoursoramaCsv } from "./services/boursorama/importBoursorama.service.ts";

    const bom = "\\uFEFF";
    const csv = bom + "LVMH;FR0000121014;5;600,00;620,00;0,30;3 100,00;100,00;3,33";
    const rows = parseBoursoramaCsv(csv);
    console.log("__RESULT__" + JSON.stringify({ count: rows.length, isin: rows[0].isin }));
  `) as { count: number; isin: string };

  assert.equal(result.count, 1);
  assert.equal(result.isin, "FR0000121014");
});

test("parseBoursoramaCsv skips the header row when it contains ISIN", () => {
  const result = runBackendScript(`
    import { parseBoursoramaCsv } from "./services/boursorama/importBoursorama.service.ts";

    const csv = [
      "Nom;ISIN;Quantite;Prix achat;Dernier cours;Var. intraday;Valorisation;Var. valorisation;Var. totale",
      "Renault;FR0000131906;3;40,00;42,00;0,10;126,00;6,00;5,00"
    ].join("\\n");
    const rows = parseBoursoramaCsv(csv);
    console.log("__RESULT__" + JSON.stringify({ count: rows.length, isin: rows[0]?.isin }));
  `) as { count: number; isin: string };

  assert.equal(result.count, 1);
  assert.equal(result.isin, "FR0000131906");
});

test("parseBoursoramaCsv records an error for incomplete rows", () => {
  const result = runBackendScript(`
    import { parseBoursoramaCsv } from "./services/boursorama/importBoursorama.service.ts";

    const csv = "Air Liquide;FR0000120073";
    const rows = parseBoursoramaCsv(csv);
    console.log("__RESULT__" + JSON.stringify({ errorCount: rows[0].errors.length }));
  `) as { errorCount: number };

  assert.ok(result.errorCount > 0, "Expected parsing error for incomplete row");
});

test("normalizeFrenchNumber handles various French numeric formats", () => {
  const result = runBackendScript(`
    import { normalizeFrenchNumber } from "./services/boursorama/importBoursorama.service.ts";

    console.log("__RESULT__" + JSON.stringify({
      integer: normalizeFrenchNumber("100"),
      decimal: normalizeFrenchNumber("1 234,56"),
      negative: normalizeFrenchNumber("-5,20"),
      withSpaces: normalizeFrenchNumber("  42,00  "),
      zero: normalizeFrenchNumber("0"),
      invalid: normalizeFrenchNumber("n/a")
    }));
  `) as { integer: number; decimal: number; negative: number; withSpaces: number; zero: number; invalid: number };

  assert.equal(result.integer, 100);
  assert.equal(result.decimal, 1234.56);
  assert.equal(result.negative, -5.2);
  assert.equal(result.withSpaces, 42);
  assert.equal(result.zero, 0);
  assert.equal(result.invalid, 0);
});

test("resolveYahooSymbolFromIsin falls back to the asset name only when the ISIN finds nothing", () => {
  const result = runBackendScript(`
    import { marketDataGateway } from "./services/market/data/market-data-gateway.service.ts";
    import { resolveYahooSymbolFromIsin } from "./services/boursorama/importBoursorama.service.ts";

    const knownAssets = {
      "Air Liquide": { symbol: "AI.PA", name: "Air Liquide", exchange: "PAR", quoteType: "EQUITY", currency: "EUR" },
      "FR0000121014": { symbol: "MC.PA", name: "LVMH", exchange: "PAR", quoteType: "EQUITY", currency: "EUR" }
    };
    let queries = [];
    marketDataGateway.search = async (query) => {
      queries.push(query);
      return { data: knownAssets[query] ? [knownAssets[query]] : [] };
    };

    const fallback = await resolveYahooSymbolFromIsin("FR0000120073", "Air Liquide");
    const fallbackQueries = queries;
    queries = [];
    const direct = await resolveYahooSymbolFromIsin("FR0000121014", "LVMH");
    console.log("__RESULT__" + JSON.stringify({
      fallback: { symbol: fallback.symbol, queries: fallbackQueries },
      direct: { symbol: direct.symbol, queries }
    }));
  `) as { fallback: { symbol: string | null; queries: string[] }; direct: { symbol: string | null; queries: string[] } };

  assert.deepEqual(result.fallback, { symbol: "AI.PA", queries: ["FR0000120073", "Air Liquide"] });
  assert.deepEqual(result.direct, { symbol: "MC.PA", queries: ["FR0000121014"] });
});
