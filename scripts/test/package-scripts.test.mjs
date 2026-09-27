import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifests = ["package.json", "backend/package.json", "frontend/package.json", "shared/package.json"];

function readScripts(manifest) {
  const content = JSON.parse(fs.readFileSync(path.join(repositoryRoot, manifest), "utf8"));
  return Object.entries(content.scripts ?? {});
}

// Sous Linux, sh développe lui-même un glob non quoté et, sans globstar, `**` n'y descend
// que d'un niveau : la CI ignorait ainsi la quasi-totalité des tests backend.
test("les globs des scripts npm sont quotés pour être développés par l'outil, pas par le shell", () => {
  const unquotedGlobs = manifests.flatMap((manifest) =>
    readScripts(manifest)
      .filter(([, command]) => command.replace(/"[^"]*"|'[^']*'/g, "").includes("*"))
      .map(([name, command]) => `${manifest} › ${name}: ${command}`)
  );

  assert.deepEqual(unquotedGlobs, []);
});
