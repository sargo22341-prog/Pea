/**
 * Tests du pipeline post-cloture : rebuildStoredRangesFromFinalData.
 * Ces tests ne font aucun appel Yahoo - ils travaillent uniquement sur la DB locale.
 *
 * Conventions des dates :
 *   - Symbole "BNP.PA" → Euronext Paris (UTC+1 hiver CET, UTC+2 ete CEST)
 *   - Janvier/Fevrier 2026 : close 17h30 CET = 16h30 UTC
 *   - Avril 2026 : close 17h30 CEST = 15h30 UTC
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function lancerScriptBackend(script: string) {
  const dossierTemp = fs.mkdtempSync(path.join(os.tmpdir(), "pea-test-"));
  const cheminSqlite = path.join(dossierTemp, "test.sqlite");
  const resultat = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "development", SQLITE_PATH: cheminSqlite }
  });
  fs.rmSync(dossierTemp, { recursive: true, force: true });
  assert.equal(resultat.status, 0, resultat.stderr);
  const lignResultat = resultat.stdout.split(/\r?\n/).find((l) => l.trim().startsWith("__RESULT__"));
  assert.ok(lignResultat, resultat.stdout);
  return JSON.parse(lignResultat.slice("__RESULT__".length));
}

// ——————————————————————————————————————————————————————————————
// Helpers communs pour les scripts de test
// ——————————————————————————————————————————————————————————————

/**
 * Insere une candle de cloture journaliere dans chart_candles range='1d'.
 * Une seule candle par jour suffit a tester rebuildStoredRangesFromFinalData
 * car la fonction lit les points 1d et les reagrege par bucket.
 */
const helperInsertClose = `
function insertClose(db, candleRepository, assetId, isoCloseUtc, closePrice) {
  const fin = new Date(new Date(isoCloseUtc).getTime() + 5 * 60 * 1000).toISOString();
  candleRepository.upsertCandles([{
    assetId, range: "1d", interval: "5m",
    datetimeStart: isoCloseUtc, datetimeEnd: fin,
    open: closePrice - 0.30, high: closePrice + 0.50,
    low: closePrice - 0.50, close: closePrice,
    volume: 10000, source: "yahoo-finance2"
  }]);
}
`;

// ——————————————————————————————————————————————————————————————
// Test 1 : range ALL stocke uniquement le prix de cloture
// ——————————————————————————————————————————————————————————————
test("rebuildStoredRangesFromFinalData - ALL stocke exactement un point avec le prix de cloture", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { marketDataService } from "./services/market/market-data.service.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    ${helperInsertClose}

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('BNP.PA', 'BNP Test')").run();
    const asset = db.prepare("SELECT * FROM assets WHERE symbol = 'BNP.PA'").get();

    insertClose(db, candleRepository, asset.id, "2026-04-28T15:30:00.000Z", 56.80);

    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["all"]);

    const allCandles = candleRepository.readCandles(asset.id, "all", "1d");
    const dernier = allCandles.at(-1);

    console.log("__RESULT__" + JSON.stringify({
      count: allCandles.length,
      close: dernier?.close,
      open: dernier?.open,
      high: dernier?.high,
      low: dernier?.low
    }));
  `);

  assert.equal(result.count, 1, "ALL doit contenir exactement 1 candle");
  assert.equal(result.close, 56.80, "le close doit correspondre au prix insere");
  assert.equal(result.open, 56.80, "ALL stocke open = close (pas de OHLCV intraday)");
  assert.equal(result.high, 56.80, "ALL stocke high = close");
  assert.equal(result.low, 56.80, "ALL stocke low = close");
});

// ——————————————————————————————————————————————————————————————
// Test 2 : range ALL - second appel n'ajoute pas de doublon
// ——————————————————————————————————————————————————————————————
test("rebuildStoredRangesFromFinalData - ALL est idempotent (pas de doublon apres double appel)", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { marketDataService } from "./services/market/market-data.service.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    ${helperInsertClose}

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('BNP.PA', 'BNP Test')").run();
    const asset = db.prepare("SELECT * FROM assets WHERE symbol = 'BNP.PA'").get();

    insertClose(db, candleRepository, asset.id, "2026-04-28T15:30:00.000Z", 56.80);

    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["all"]);
    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["all"]);

    const count = candleRepository.countCandles(asset.id, "all", "1d");
    console.log("__RESULT__" + JSON.stringify({ count }));
  `);

  assert.equal(result.count, 1, "un double rebuild ALL ne doit pas creer de doublon");
});

// ——————————————————————————————————————————————————————————————
// Test 3 : range 1W construit depuis 7 jours de 1D finalises
// ——————————————————————————————————————————————————————————————
test("rebuildStoredRangesFromFinalData - 1W produit 7 candles depuis 7 jours de 1D, close correct", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { marketDataService } from "./services/market/market-data.service.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    ${helperInsertClose}

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('BNP.PA', 'BNP Test')").run();
    const asset = db.prepare("SELECT * FROM assets WHERE symbol = 'BNP.PA'").get();

    // 7 jours ouvrés consécutifs - prices croissants pour faciliter la vérif
    const jours = [
      { iso: "2026-04-20T15:30:00.000Z", close: 55.10 },
      { iso: "2026-04-21T15:30:00.000Z", close: 55.50 },
      { iso: "2026-04-22T15:30:00.000Z", close: 55.90 },
      { iso: "2026-04-23T15:30:00.000Z", close: 56.10 },
      { iso: "2026-04-24T15:30:00.000Z", close: 56.30 },
      { iso: "2026-04-27T15:30:00.000Z", close: 56.60 },
      { iso: "2026-04-28T15:30:00.000Z", close: 56.80 },
    ];
    for (const j of jours) insertClose(db, candleRepository, asset.id, j.iso, j.close);

    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["1w"]);

    const candles1w = candleRepository.readCandles(asset.id, "1w", "2h");
    const dernierClose = candles1w.at(-1)?.close;

    console.log("__RESULT__" + JSON.stringify({ count: candles1w.length, dernierClose }));
  `);

  assert.equal(result.count, 7, "1W doit avoir 7 candles (1 par jour ouvre)");
  assert.equal(result.dernierClose, 56.80, "le dernier close 1W doit etre le prix du dernier jour");
});

// ——————————————————————————————————————————————————————————————
// Test 4 : 1W - build incrementale preserve les candles existants
// (c'est le test le plus important : garantit que le pipeline ne vide pas 1W)
// ——————————————————————————————————————————————————————————————
test("rebuildStoredRangesFromFinalData - 1W incremental preserve les 6 jours existants quand on ajoute le 7e", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { marketDataService } from "./services/market/market-data.service.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    ${helperInsertClose}

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('BNP.PA', 'BNP Test')").run();
    const asset = db.prepare("SELECT * FROM assets WHERE symbol = 'BNP.PA'").get();

    // Etape 1 : 6 jours en 1D, premier rebuild
    const jours6 = [
      { iso: "2026-04-20T15:30:00.000Z", close: 55.10 },
      { iso: "2026-04-21T15:30:00.000Z", close: 55.50 },
      { iso: "2026-04-22T15:30:00.000Z", close: 55.90 },
      { iso: "2026-04-23T15:30:00.000Z", close: 56.10 },
      { iso: "2026-04-24T15:30:00.000Z", close: 56.30 },
      { iso: "2026-04-27T15:30:00.000Z", close: 56.60 },
    ];
    for (const j of jours6) insertClose(db, candleRepository, asset.id, j.iso, j.close);
    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["1w"]);

    const apres6 = candleRepository.countCandles(asset.id, "1w", "2h");

    // Etape 2 : ajout du 7e jour et second rebuild
    insertClose(db, candleRepository, asset.id, "2026-04-28T15:30:00.000Z", 56.80);
    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["1w"]);

    const apres7 = candleRepository.countCandles(asset.id, "1w", "2h");

    console.log("__RESULT__" + JSON.stringify({ apres6, apres7 }));
  `);

  assert.equal(result.apres6, 6, "apres 6 jours de 1D : 1W doit avoir 6 candles");
  assert.equal(result.apres7, 7, "apres le 7e jour : 1W doit avoir 7 candles (incremental, pas de reset)");
});

// ——————————————————————————————————————————————————————————————
// Test 5 : range 1M borne a 30 jours ouvrés meme avec 35 jours de 1D
// ——————————————————————————————————————————————————————————————
test("rebuildStoredRangesFromFinalData - 1M est borne a 30 jours ouvrés meme avec 35 jours de sources 1D", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { marketDataService } from "./services/market/market-data.service.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    ${helperInsertClose}

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('BNP.PA', 'BNP Test')").run();
    const asset = db.prepare("SELECT * FROM assets WHERE symbol = 'BNP.PA'").get();

    // 36 jours ouvrés : Jan 5 -> Feb 20 2026 (UTC+1 hiver, close = 16:30 UTC)
    const jours36 = [];
    let d = new Date("2026-01-05T16:30:00.000Z");
    while (jours36.length < 36) {
      const dow = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Paris" })).getDay();
      if (dow !== 0 && dow !== 6) jours36.push(d.toISOString());
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    }

    let prix = 50.00;
    for (const iso of jours36) {
      insertClose(db, candleRepository, asset.id, iso, prix);
      prix = Math.round((prix + 0.10) * 100) / 100;
    }

    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["1m"]);

    const count1m = candleRepository.countCandles(asset.id, "1m", "4h");
    const count1d = candleRepository.countCandles(asset.id, "1d", "5m");

    console.log("__RESULT__" + JSON.stringify({ count1m, count1d }));
  `);

  assert.equal(result.count1d, 36, "la source 1D doit conserver tous les 36 jours inseres");
  assert.ok(result.count1m <= 30, `1M doit etre borne a 30 jours (etait ${result.count1m as number})`);
  assert.ok(result.count1m >= 28, `1M doit avoir au moins 28 jours (etait ${result.count1m as number})`);
});

// ——————————————————————————————————————————————————————————————
// Test 6 : 1W et 1M simultanes depuis la meme source 1D
// ——————————————————————————————————————————————————————————————
test("rebuildStoredRangesFromFinalData - rebuild 1W et 1M en meme temps depuis les memes 1D", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { marketDataService } from "./services/market/market-data.service.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    ${helperInsertClose}

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('BNP.PA', 'BNP Test')").run();
    const asset = db.prepare("SELECT * FROM assets WHERE symbol = 'BNP.PA'").get();

    // 10 jours ouvrés en 1D
    const jours10 = [
      "2026-04-14T15:30:00.000Z",
      "2026-04-15T15:30:00.000Z",
      "2026-04-16T15:30:00.000Z",
      "2026-04-17T15:30:00.000Z",
      "2026-04-20T15:30:00.000Z",
      "2026-04-21T15:30:00.000Z",
      "2026-04-22T15:30:00.000Z",
      "2026-04-23T15:30:00.000Z",
      "2026-04-24T15:30:00.000Z",
      "2026-04-28T15:30:00.000Z",
    ];
    let prix = 54.00;
    for (const iso of jours10) {
      insertClose(db, candleRepository, asset.id, iso, prix);
      prix = Math.round((prix + 0.20) * 100) / 100;
    }

    // Rebuild 1W et 1M en un seul appel (comme la queue post-close)
    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["1w", "1m"]);

    const count1w = candleRepository.countCandles(asset.id, "1w", "2h");
    const count1m = candleRepository.countCandles(asset.id, "1m", "4h");
    const close1w = candleRepository.readCandles(asset.id, "1w", "2h").at(-1)?.close;
    const close1m = candleRepository.readCandles(asset.id, "1m", "4h").at(-1)?.close;

    console.log("__RESULT__" + JSON.stringify({ count1w, count1m, close1w, close1m }));
  `);

  // 10 jours disponibles mais 1W limite a 7 → les 3 plus anciens depassent la fenetre
  assert.ok(result.count1w <= 10, `1W ne doit pas depasser 10 candles (etait ${result.count1w as number})`);
  assert.ok(result.count1m <= 10, `1M doit avoir les 10 jours (tous dans les 30 jours)`);
  assert.equal(result.close1w, result.close1m, "le dernier close doit etre identique entre 1W et 1M");
});

// ——————————————————————————————————————————————————————————————
// Test 7 : marker de finalisation écrit après rebuild
// ——————————————————————————————————————————————————————————————
test("rebuildStoredRangesFromFinalData - marque le trading_date comme finalise apres rebuild", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { marketDataService } from "./services/market/market-data.service.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    ${helperInsertClose}

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('BNP.PA', 'BNP Test')").run();
    const asset = db.prepare("SELECT * FROM assets WHERE symbol = 'BNP.PA'").get();

    insertClose(db, candleRepository, asset.id, "2026-04-28T15:30:00.000Z", 56.80);

    const avantRebuild1w = candleRepository.isFinalized(asset.id, "2026-04-28", "1w");

    await marketDataService.rebuildStoredRangesFromFinalData(asset, ["1w", "all"]);

    const apresRebuild1w = candleRepository.isFinalized(asset.id, "2026-04-28", "1w");
    const apresRebuildAll = candleRepository.isFinalized(asset.id, "2026-04-28", "all");

    console.log("__RESULT__" + JSON.stringify({ avantRebuild1w, apresRebuild1w, apresRebuildAll }));
  `);

  assert.equal(result.avantRebuild1w, false, "1W ne doit pas etre marque finalise avant le rebuild");
  assert.equal(result.apresRebuild1w, true, "1W doit etre marque finalise apres le rebuild");
  assert.equal(result.apresRebuildAll, true, "ALL doit etre marque finalise apres le rebuild");
});
