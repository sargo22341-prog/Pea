import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

function lancerScriptBackend(script: string, nodeEnv = "development") {
  const dossierTemp = fs.mkdtempSync(path.join(os.tmpdir(), "pea-test-"));
  const cheminSqlite = path.join(dossierTemp, "test.sqlite");
  const resultat = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: path.resolve(import.meta.dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      SQLITE_PATH: cheminSqlite
    }
  });

  fs.rmSync(dossierTemp, { recursive: true, force: true });
  assert.equal(resultat.status, 0, resultat.stderr);
  const lignResultat = resultat.stdout
    .split(/\r?\n/)
    .find((ligne) => ligne.trim().startsWith("__RESULT__"));

  assert.ok(lignResultat, resultat.stdout);
  return JSON.parse(lignResultat.slice("__RESULT__".length));
}

test("le changement de mot de passe invalide toutes les sessions existantes", () => {
  const resultat = lancerScriptBackend(`
    import { app } from "./app.ts";

    const motDePasse = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        // Création du compte et récupération du cookie de session initial
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: motDePasse, confirmPassword: motDePasse })
        });
        const cookieInitial = setup.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Vérification que la session initiale est valide
        const meAvant = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: cookieInitial } });
        const corpsMeAvant = await meAvant.json();

        // Changement de mot de passe (doit invalider toutes les sessions)
        const nouveauMotDePasse = "nouveau mot de passe securise";
        const miseAJour = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookieInitial },
          body: JSON.stringify({ password: nouveauMotDePasse, confirmPassword: nouveauMotDePasse })
        });

        // La session initiale ne doit plus authentifier l'utilisateur
        const meApres = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: cookieInitial } });
        const corpsMeApres = await meApres.json();

        console.log("__RESULT__" + JSON.stringify({
          statutSetup: setup.status,
          utilisateurAvant: corpsMeAvant.user?.username,
          statutMiseAJour: miseAJour.status,
          utilisateurApres: corpsMeApres.user
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(resultat.statutSetup, 201);
  assert.equal(resultat.utilisateurAvant, "alice");
  assert.equal(resultat.statutMiseAJour, 200);
  // La session doit être null après invalidation
  assert.equal(resultat.utilisateurApres, null);
});

test("le changement de préférences sans nouveau mot de passe conserve la session active", () => {
  const resultat = lancerScriptBackend(`
    import { app } from "./app.ts";

    const motDePasse = "correct horse battery staple";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: motDePasse, confirmPassword: motDePasse })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Mise à jour d'une préférence sans changer le mot de passe
        const miseAJour = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ defaultChartRange: "1w" })
        });

        // La session doit rester valide
        const me = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: cookie } });
        const corpsMe = await me.json();

        console.log("__RESULT__" + JSON.stringify({
          statutMiseAJour: miseAJour.status,
          utilisateur: corpsMe.user?.username,
          intervalle: corpsMe.user?.defaultChartRange
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(resultat.statutMiseAJour, 200);
  assert.equal(resultat.utilisateur, "alice");
  assert.equal(resultat.intervalle, "1w");
});

test("la reconnexion avec le nouveau mot de passe fonctionne après invalidation", () => {
  const resultat = lancerScriptBackend(`
    import { app } from "./app.ts";

    const motDePasseInitial = "correct horse battery staple";
    const nouveauMotDePasse = "tout nouveau mot de passe";
    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const setup = await fetch(\`\${baseUrl}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: motDePasseInitial, confirmPassword: motDePasseInitial })
        });
        const cookie = setup.headers.get("set-cookie")?.split(";")[0] ?? "";

        // Changement de mot de passe
        await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ password: nouveauMotDePasse, confirmPassword: nouveauMotDePasse })
        });

        // Reconnexion avec l'ancien mot de passe — doit échouer
        const connexionAncien = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: motDePasseInitial })
        });

        // Reconnexion avec le nouveau mot de passe — doit réussir
        const connexionNouveau = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: nouveauMotDePasse })
        });
        const cookieNouveau = connexionNouveau.headers.get("set-cookie")?.split(";")[0] ?? "";
        const me = await fetch(\`\${baseUrl}/api/auth/me\`, { headers: { Cookie: cookieNouveau } });
        const corpsMe = await me.json();

        console.log("__RESULT__" + JSON.stringify({
          statutAncienMotDePasse: connexionAncien.status,
          statutNouveauMotDePasse: connexionNouveau.status,
          utilisateur: corpsMe.user?.username
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(resultat.statutAncienMotDePasse, 401);
  assert.equal(resultat.statutNouveauMotDePasse, 200);
  assert.equal(resultat.utilisateur, "alice");
});

test("les migrations créent les index et colonnes attendus sur un schéma vierge", () => {
  const resultat = lancerScriptBackend(`
    import { db } from "./db.ts";

    const indexExistants = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name);
    const colonnesUsers = db.prepare("PRAGMA table_info(users)").all().map((r) => r.name);
    const colonnesUserAssets = db.prepare("PRAGMA table_info(user_assets)").all();
    const colonnesMarketSnapshots = db.prepare("PRAGMA table_info(asset_market_snapshots)").all().map((r) => r.name);
    const colonneUserId = colonnesUserAssets.find((c) => c.name === "user_id");
    const versionsMigrations = db.prepare("SELECT version FROM _migrations ORDER BY version").all().map((r) => r.version);

    console.log("__RESULT__" + JSON.stringify({
      indexExistants,
      colonnesUsers,
      colonnesMarketSnapshots,
      typeUserIdUserAssets: colonneUserId?.type,
      versionsMigrations
    }));
  `);

  assert.ok(resultat.indexExistants.includes("idx_user_sessions_expires_at"), "index sessions absent");
  assert.ok(resultat.colonnesUsers.includes("has_profile_icon"), "colonne has_profile_icon absente");
  assert.equal(resultat.typeUserIdUserAssets?.toUpperCase(), "INTEGER", "user_assets.user_id doit être INTEGER");
  assert.ok(resultat.indexExistants.includes("idx_chart_candles_1d_asset_interval"), "index chart_candles_1d absent");
  assert.ok(resultat.indexExistants.includes("idx_chart_candles_1d_asset_interval_start"), "index chart_candles_1d date absent");
  assert.ok(resultat.indexExistants.includes("idx_chart_candles_1w_asset_interval_start"), "index chart_candles_1w date absent");
  assert.ok(resultat.indexExistants.includes("idx_chart_candles_1m_asset_interval_start"), "index chart_candles_1m date absent");
  assert.ok(resultat.indexExistants.includes("idx_chart_candles_all_asset_interval_start"), "index chart_candles_all date absent");
  assert.ok(resultat.indexExistants.includes("idx_chart_candles_1w_asset_interval"), "index chart_candles_1w absent");
  assert.ok(resultat.indexExistants.includes("idx_chart_candles_1m_asset_interval"), "index chart_candles_1m absent");
  assert.ok(resultat.indexExistants.includes("idx_chart_candles_all_asset_interval"), "index chart_candles_all absent");
  assert.ok(resultat.indexExistants.includes("idx_asset_calendar_events_symbol"), "index calendar_events symbol absent");
  assert.ok(resultat.indexExistants.includes("idx_asset_calendar_events_date"), "index calendar_events date absent");
  assert.ok(resultat.indexExistants.includes("idx_portfolio_positions_performance_cache_user_range"), "index positions performance cache absent");
  assert.ok(resultat.indexExistants.includes("idx_market_data_finalizations_asset_range_date"), "index finalizations asset/range/date absent");
  assert.ok(resultat.indexExistants.includes("idx_yahoo_usage_logs_created_at"), "index yahoo usage created_at absent");
  assert.ok(resultat.indexExistants.includes("idx_yahoo_usage_logs_method_created_at"), "index yahoo usage method/date absent");
  assert.ok(resultat.indexExistants.includes("idx_yahoo_usage_logs_ticker_created_at"), "index yahoo usage ticker/date absent");
  assert.ok(resultat.indexExistants.includes("idx_data_construction_tasks_active_key"), "index queue construction active absent");
  assert.ok(resultat.indexExistants.includes("idx_data_construction_tasks_status_priority_id"), "index queue construction status priority absent");
  assert.ok(resultat.colonnesMarketSnapshots.includes("fifty_two_week_low"), "colonne fifty_two_week_low absente");
  assert.ok(resultat.colonnesMarketSnapshots.includes("fifty_two_week_high"), "colonne fifty_two_week_high absente");
  assert.ok(resultat.colonnesMarketSnapshots.includes("average_volume_10d"), "colonne average_volume_10d absente");
  assert.ok(resultat.colonnesMarketSnapshots.includes("ex_dividend_date"), "colonne ex_dividend_date absente");
  assert.ok(resultat.colonnesMarketSnapshots.includes("market_core_updated_at"), "colonne market_core_updated_at absente");
  assert.ok(resultat.colonnesMarketSnapshots.includes("liquidity_updated_at"), "colonne liquidity_updated_at absente");
  assert.ok(resultat.colonnesMarketSnapshots.includes("range_52w_updated_at"), "colonne range_52w_updated_at absente");
  assert.ok(resultat.colonnesMarketSnapshots.includes("dividend_info_updated_at"), "colonne dividend_info_updated_at absente");
  assert.ok(resultat.colonnesMarketSnapshots.includes("market_profile_updated_at"), "colonne market_profile_updated_at absente");
  assert.deepEqual(
    resultat.versionsMigrations,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26],
    "les 26 migrations doivent etre enregistrees"
  );
});

test("cache registry applique les regles d'invalidation metier", () => {
  const resultat = lancerScriptBackend(`
    import { db } from "./db.ts";
    import { cacheRegistry } from "./services/shared/cache-registry.service.ts";

    const now = Date.now();
    const expiresAt = now + 60_000;
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at) VALUES ('quote', 'AAA.PA', '{}', ?)").run(now);
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at) VALUES ('dividends', 'AAA.PA', '{}', ?)").run(now);
    db.prepare("INSERT INTO cache_entries (scope, key, payload, fetched_at, expires_at) VALUES ('asset_article', 'AAA.PA', '{}', ?, ?)").run(now, expiresAt);
    db.prepare("INSERT INTO user_assets (user_id, symbol, quantity, average_price, transaction_count, total_fees, invested_amount, updated_at) VALUES (1, 'AAA.PA', 1, 10, 1, 0, 10, ?)").run(now);
    db.prepare("INSERT INTO portfolio_chart_cache (cache_key, user_id, range, payload, cached_at, expires_at) VALUES ('1:1d', '1', '1d', '{}', ?, ?)").run(now, expiresAt);
    db.prepare("INSERT INTO portfolio_positions_performance_cache (cache_key, user_id, range, portfolio_version, market_data_version, payload, cached_at, expires_at) VALUES ('1:p:1d', '1', '1d', 'p', 'm', '{}', ?, ?)").run(now, expiresAt);
    db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('1:analysis:default', '1', 'analysis', NULL, '{}', ?, ?)").run(now, expiresAt);
    db.prepare("INSERT INTO frontend_block_cache (cache_key, user_id, block, range, payload, cached_at, expires_at) VALUES ('1:dividends:default', '1', 'dividends', NULL, '{}', ?, ?)").run(now, expiresAt);

    cacheRegistry.invalidate({ type: "MarketSnapshotUpdated", symbol: "AAA.PA" });
    const afterMarket = {
      quotes: db.prepare("SELECT COUNT(*) AS count FROM cache_entries WHERE scope = 'quote' AND key = 'AAA.PA'").get().count,
      portfolioCharts: db.prepare("SELECT COUNT(*) AS count FROM portfolio_chart_cache").get().count,
      userAssets: db.prepare("SELECT COUNT(*) AS count FROM user_assets").get().count
    };

    cacheRegistry.invalidate({ type: "DividendDataUpdated", symbol: "AAA.PA" });
    const afterDividends = {
      dividendCache: db.prepare("SELECT COUNT(*) AS count FROM cache_entries WHERE scope = 'dividends' AND key = 'AAA.PA'").get().count,
      frontendBlocks: db.prepare("SELECT COUNT(*) AS count FROM frontend_block_cache").get().count
    };

    cacheRegistry.invalidate({ type: "AssetStaticDataUpdated", symbol: "AAA.PA" });
    const afterStatic = {
      articles: db.prepare("SELECT COUNT(*) AS count FROM cache_entries WHERE scope = 'asset_article' AND key = 'AAA.PA'").get().count
    };

    console.log("__RESULT__" + JSON.stringify({ afterMarket, afterDividends, afterStatic }));
  `);

  assert.deepEqual(resultat.afterMarket, { quotes: 0, portfolioCharts: 0, userAssets: 0 });
  assert.deepEqual(resultat.afterDividends, { dividendCache: 0, frontendBlocks: 0 });
  assert.deepEqual(resultat.afterStatic, { articles: 0 });
});

test("les mutations en production sans header Origin sont bloquées", () => {
  const resultat = lancerScriptBackend(`
    import { app } from "./app.ts";

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      try {
        // Requête sans header Origin sur une route mutante en production
        const reponse = await fetch(\`http://127.0.0.1:\${address.port}/api/auth/setup\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: "correct horse battery staple", confirmPassword: "correct horse battery staple" })
        });
        console.log("__RESULT__" + JSON.stringify({ statut: reponse.status }));
      } finally {
        server.close();
      }
    });
  `, "production");

  // En production, sans Origin, la requête doit être rejetée
  assert.equal(resultat.statut, 403);
});
