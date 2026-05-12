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

test("pruneIntradayCache garde exactement les N derniers trading_days par symbole", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { pruneIntradayCache } from "./services/yahoo/cache/history.cache.ts";

    const jours = ["2026-04-23", "2026-04-24", "2026-04-25", "2026-04-28", "2026-04-29"];
    for (const jour of jours) {
      db.prepare(
        "INSERT INTO cached_intraday_history (cache_key, symbol, range, interval, trading_day, payload, last_updated_at) VALUES (?, 'BNP.PA', '1d', '5m', ?, '[]', 1000)"
      ).run('BNP.PA:1d:5m:' + jour, jour);
    }

    pruneIntradayCache("BNP.PA", 3);

    const restants = db.prepare(
      "SELECT trading_day FROM cached_intraday_history WHERE symbol = 'BNP.PA' ORDER BY trading_day ASC"
    ).all().map((r) => r.trading_day);

    console.log("__RESULT__" + JSON.stringify({ restants }));
  `);

  assert.deepEqual(result.restants, ["2026-04-25", "2026-04-28", "2026-04-29"],
    "doit garder exactement les 3 derniers trading_days");
});

test("pruneIntradayCache ne touche pas aux donnees d'un autre symbole", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { pruneIntradayCache } from "./services/yahoo/cache/history.cache.ts";

    const jours = ["2026-04-23", "2026-04-24", "2026-04-25", "2026-04-28", "2026-04-29"];
    for (const jour of jours) {
      db.prepare(
        "INSERT INTO cached_intraday_history (cache_key, symbol, range, interval, trading_day, payload, last_updated_at) VALUES (?, ?, '1d', '5m', ?, '[]', 1000)"
      ).run('BNP.PA:1d:5m:' + jour, 'BNP.PA', jour);
      db.prepare(
        "INSERT INTO cached_intraday_history (cache_key, symbol, range, interval, trading_day, payload, last_updated_at) VALUES (?, ?, '1d', '5m', ?, '[]', 1000)"
      ).run('MC.PA:1d:5m:' + jour, 'MC.PA', jour);
    }

    pruneIntradayCache("BNP.PA", 3);

    const bnp = db.prepare(
      "SELECT COUNT(*) AS n FROM cached_intraday_history WHERE symbol = 'BNP.PA'"
    ).get().n;
    const mc = db.prepare(
      "SELECT COUNT(*) AS n FROM cached_intraday_history WHERE symbol = 'MC.PA'"
    ).get().n;

    console.log("__RESULT__" + JSON.stringify({ bnp, mc }));
  `);

  assert.equal(result.bnp, 3, "BNP.PA doit avoir 3 entrees restantes");
  assert.equal(result.mc, 5, "MC.PA ne doit pas etre affecte");
});

test("pruneBefore supprime les candles 1d anterieurs au cutoff", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('TEST.PA', 'Asset Test')").run();
    const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'TEST.PA'").get().id;

    const jours = [
      "2026-04-21T09:00:00.000Z",
      "2026-04-22T09:00:00.000Z",
      "2026-04-23T09:00:00.000Z",
      "2026-04-28T09:00:00.000Z",
      "2026-04-29T09:00:00.000Z",
    ];
    for (const debut of jours) {
      const fin = new Date(new Date(debut).getTime() + 5 * 60 * 1000).toISOString();
      candleRepository.upsertCandles([{
        assetId, range: "1d", interval: "5m",
        datetimeStart: debut, datetimeEnd: fin,
        open: 50, high: 52, low: 49, close: 51, volume: 1000,
        source: "yahoo-finance2"
      }]);
    }

    const avant = candleRepository.countCandles(assetId, "1d", "5m");

    // Garder les 3 derniers jours : supprimer tout ce qui est avant 2026-04-23
    candleRepository.pruneBefore(assetId, "1d", "5m", "2026-04-23T09:00:00.000Z");

    const apres = candleRepository.countCandles(assetId, "1d", "5m");

    console.log("__RESULT__" + JSON.stringify({ avant, apres }));
  `);

  assert.equal(result.avant, 5, "5 candles doivent exister avant pruning");
  assert.equal(result.apres, 3, "3 candles doivent rester apres pruning (cutoff exclu)");
});

test("la retention 30 jours supporte 35 jours de candles 1d inseres en DB", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('MC.PA', 'LVMH Test')").run();
    const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'MC.PA'").get().id;

    // Insere 35 jours consecutifs en semaine a partir du 2026-01-05 (lundi)
    const jours = [];
    let d = new Date("2026-01-05T09:30:00.000Z");
    while (jours.length < 35) {
      const dow = d.getUTCDay();
      if (dow !== 0 && dow !== 6) jours.push(new Date(d));
      d = new Date(d.getTime() + 24 * 60 * 60 * 1000);
    }

    for (const jour of jours) {
      const debut = jour.toISOString();
      const fin = new Date(jour.getTime() + 5 * 60 * 1000).toISOString();
      candleRepository.upsertCandles([{
        assetId, range: "1d", interval: "5m",
        datetimeStart: debut, datetimeEnd: fin,
        open: 50, high: 52, low: 49, close: 51, volume: 1000,
        source: "yahoo-finance2"
      }]);
    }

    const avant = candleRepository.countCandles(assetId, "1d", "5m");

    // Cutoff = debut du 6eme jour : supprime les 5 premiers, garde les 30 derniers
    const cutoff = jours[5].toISOString();
    candleRepository.pruneBefore(assetId, "1d", "5m", cutoff);

    const apres = candleRepository.countCandles(assetId, "1d", "5m");

    console.log("__RESULT__" + JSON.stringify({ avant, apres, cutoff }));
  `);

  assert.equal(result.avant, 35, "35 candles doivent exister avant pruning");
  assert.equal(result.apres, 30, "exactement 30 candles doivent rester apres retention 30 jours");
});

test("pruneBefore pour 1d ne supprime pas les candles d'autres ranges", () => {
  const result = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { candleRepository } from "./repositories/candles/candle.repository.ts";

    db.prepare("INSERT INTO assets (symbol, name) VALUES ('AIR.PA', 'Airbus Test')").run();
    const assetId = db.prepare("SELECT id FROM assets WHERE symbol = 'AIR.PA'").get().id;

    const jours = ["2026-04-21T09:00:00.000Z", "2026-04-22T09:00:00.000Z", "2026-04-23T09:00:00.000Z"];
    for (const debut of jours) {
      const fin = new Date(new Date(debut).getTime() + 5 * 60 * 1000).toISOString();
      // Range 1d
      candleRepository.upsertCandles([{ assetId, range: "1d", interval: "5m", datetimeStart: debut, datetimeEnd: fin, open: 50, high: 52, low: 49, close: 51, volume: 1000, source: "yahoo-finance2" }]);
      // Range 1w (ne doit pas etre touche)
      candleRepository.upsertCandles([{ assetId, range: "1w", interval: "2h", datetimeStart: debut, datetimeEnd: fin, open: 50, high: 52, low: 49, close: 51, volume: 1000, source: "stored_final" }]);
    }

    // Pruner uniquement les candles 1d
    candleRepository.pruneBefore(assetId, "1d", "5m", "2026-04-22T09:00:00.000Z");

    const un_d = candleRepository.countCandles(assetId, "1d", "5m");
    const un_w = candleRepository.countCandles(assetId, "1w", "2h");

    console.log("__RESULT__" + JSON.stringify({ un_d, un_w }));
  `);

  assert.equal(result.un_d, 2, "1d doit avoir perdu 1 candle");
  assert.equal(result.un_w, 3, "1w ne doit pas etre affecte par le pruning de 1d");
});
