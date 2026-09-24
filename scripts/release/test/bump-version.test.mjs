import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { bumpVersion } from "../bump-version.mjs";

const workspaces = ["backend", "frontend", "shared"];

function writeJson(root, file, data, eol = "\n") {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(data, null, 2)}\n`.replace(/\n/g, eol));
}

function createRepository(version, eol) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pea-bump-"));
  writeJson(root, "package.json", { name: "root", version }, eol);
  for (const workspace of workspaces) writeJson(root, `${workspace}/package.json`, { name: workspace, version }, eol);
  const packages = Object.fromEntries(["", ...workspaces].map((key) => [key, { version }]));
  packages["node_modules/dep"] = { version: "9.9.9" };
  writeJson(root, "package-lock.json", { name: "root", version, packages }, eol);
  const gradleFile = path.join(root, "frontend/android/app/build.gradle");
  fs.mkdirSync(path.dirname(gradleFile), { recursive: true });
  fs.writeFileSync(gradleFile, [
    'def androidVersionName = System.getenv("ANDROID_VERSION_NAME") ?: "1.0.0"',
    'def androidVersionCode = (System.getenv("ANDROID_VERSION_CODE") ?: "1000000") as int',
    "",
  ].join(eol));
  return root;
}

function readJson(root, file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

test("bumpVersion aligne les paquets, le lockfile et build.gradle sur la nouvelle version", (t) => {
  const root = createRepository("1.0.21", "\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const result = bumpVersion(root, "minor");

  assert.deepEqual(result, { previous: "1.0.21", version: "1.1.0", versionCode: 1010000 });
  for (const file of ["package.json", ...workspaces.map((workspace) => `${workspace}/package.json`)]) {
    assert.equal(readJson(root, file).version, "1.1.0", file);
  }
  const lock = readJson(root, "package-lock.json");
  assert.equal(lock.version, "1.1.0");
  for (const key of ["", ...workspaces]) assert.equal(lock.packages[key].version, "1.1.0");
  assert.equal(lock.packages["node_modules/dep"].version, "9.9.9");
  const gradle = fs.readFileSync(path.join(root, "frontend/android/app/build.gradle"), "utf8");
  assert.match(gradle, /\?: "1\.1\.0"/);
  assert.match(gradle, /\?: "1010000"\) as int/);
});

test("bumpVersion conserve les fins de ligne Windows d'un poste de développement", (t) => {
  const root = createRepository("1.0.21", "\r\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  bumpVersion(root);

  const text = fs.readFileSync(path.join(root, "package.json"), "utf8");
  assert.equal(text.replace(/\r\n/g, "").includes("\n"), false);
  assert.equal(readJson(root, "package.json").version, "1.0.22");
});

test("bumpVersion n'écrit rien si la version courante est invalide", (t) => {
  const root = createRepository("1.0.99", "\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.throws(() => bumpVersion(root), /hors limites/);
  assert.equal(readJson(root, "shared/package.json").version, "1.0.99");
});
