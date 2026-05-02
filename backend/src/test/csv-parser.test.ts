import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runBackendScript(script: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pea-test-"));
  const sqlitePath = path.join(tempDir, "test.sqlite");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "development",
      SQLITE_PATH: sqlitePath
    }
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  const jsonLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("__RESULT__"));

  assert.ok(jsonLine, result.stdout);
  return JSON.parse(jsonLine.slice("__RESULT__".length));
}

test("parseBoursoramaCsv parses a valid semicolon-delimited row", () => {
  const result = runBackendScript(`
    import { parseBoursoramaCsv } from "./services/boursorama/importBoursorama.service.ts";

    const csv = "Air Liquide;FR0000120073;10;150,00;155,50;0,50;1 555,00;5,00;3,67";
    const rows = parseBoursoramaCsv(csv);
    console.log("__RESULT__" + JSON.stringify({ count: rows.length, name: rows[0].name, isin: rows[0].isin, quantity: rows[0].quantity, errors: rows[0].errors }));
  `);

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
  `);

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
  `);

  assert.equal(result.count, 1);
  assert.equal(result.isin, "FR0000131906");
});

test("parseBoursoramaCsv records an error for incomplete rows", () => {
  const result = runBackendScript(`
    import { parseBoursoramaCsv } from "./services/boursorama/importBoursorama.service.ts";

    const csv = "Air Liquide;FR0000120073";
    const rows = parseBoursoramaCsv(csv);
    console.log("__RESULT__" + JSON.stringify({ errorCount: rows[0].errors.length }));
  `);

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
  `);

  assert.equal(result.integer, 100);
  assert.equal(result.decimal, 1234.56);
  assert.equal(result.negative, -5.2);
  assert.equal(result.withSpaces, 42);
  assert.equal(result.zero, 0);
  assert.equal(result.invalid, 0);
});

test("confirmBoursoramaImport with more than 1000 rows returns an error without hitting Yahoo", () => {
  const result = runBackendScript(`
    import { confirmBoursoramaImport } from "./services/boursorama/importBoursorama.service.ts";

    const rows = Array.from({ length: 1001 }, (_, i) => ({
      line: i + 1,
      name: "Test " + i,
      isin: "FR000000000" + i,
      quantity: 1,
      buyingPrice: 100,
      lastPrice: 100,
      intradayVariation: 0,
      amount: 100,
      amountVariation: 0,
      variation: 0,
      symbol: "TEST" + i,
      needsReview: false,
      errors: [],
      action: undefined
    }));

    const result = await confirmBoursoramaImport(rows);
    console.log("__RESULT__" + JSON.stringify({ errorCount: result.errors.length, firstErrorLine: result.errors[0]?.line }));
  `);

  assert.ok(result.errorCount > 0, "Expected error for over-limit import");
  assert.equal(result.firstErrorLine, 0);
});
