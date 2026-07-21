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
    cwd: path.resolve(import.meta.dirname, "..", ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      PEA_TEST_SQLITE_PATH: cheminSqlite
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

test("la migration repare les colonnes de preferences utilisateur manquantes", () => {
  const resultat = lancerScriptBackend(`
    import Database from "better-sqlite3";
    import bcrypt from "bcryptjs";

    const motDePasse = "correct horse battery staple";
    const sqlitePath = process.env.PEA_TEST_SQLITE_PATH;
    const legacyDb = new Database(sqlitePath);
    legacyDb.exec(\`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        bootstrap_admin INTEGER NOT NULL DEFAULT 0,
        profile_icon_url TEXT,
        profile_icon_path TEXT,
        profile_icon_mime_type TEXT,
        profile_icon_size INTEGER,
        has_profile_icon INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE _migrations (
        version INTEGER PRIMARY KEY,
        description TEXT NOT NULL,
        appliquee_le TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    \`);
    legacyDb.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run("alice", await bcrypt.hash(motDePasse, 4));
    for (let version = 1; version <= 31; version += 1) {
      legacyDb.prepare("INSERT INTO _migrations (version, description) VALUES (?, ?)").run(version, "legacy");
    }
    legacyDb.close();

    const { app } = await import("./app.ts");
    const { db } = await import("./db.ts");

    const server = app.listen(0, "127.0.0.1", async () => {
      const address = server.address();
      const baseUrl = \`http://127.0.0.1:\${address.port}\`;
      try {
        const login = await fetch(\`\${baseUrl}/api/auth/login\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: "alice", password: motDePasse })
        });
        const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
        const miseAJour = await fetch(\`\${baseUrl}/api/auth/me\`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ defaultChartRange: "1w", privacyModeEnabled: true, language: "fr" })
        });
        const corpsMiseAJour = await miseAJour.json();
        const colonnesUsers = db.prepare("PRAGMA table_info(users)").all().map((r) => r.name);
        console.log("__RESULT__" + JSON.stringify({
          statutMiseAJour: miseAJour.status,
          intervalle: corpsMiseAJour.defaultChartRange,
          privacy: corpsMiseAJour.privacyModeEnabled,
          colonnesUsers
        }));
      } finally {
        server.close();
      }
    });
  `);

  assert.equal(resultat.statutMiseAJour, 200);
  assert.equal(resultat.intervalle, "1w");
  assert.equal(resultat.privacy, true);
  assert.ok(resultat.colonnesUsers.includes("privacy_mode_enabled"));
  assert.ok(resultat.colonnesUsers.includes("projection_end_age"));
});

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
          body: JSON.stringify({ currentPassword: motDePasse, password: nouveauMotDePasse, confirmPassword: nouveauMotDePasse })
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

