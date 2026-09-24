// Monte la version de l'application dans les package.json, le lockfile et build.gradle.
// Usage : node scripts/release/bump-version.mjs [patch|minor|major]   (patch par défaut)
// En CI, écrit version=… et version_code=… dans $GITHUB_OUTPUT.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { androidVersionCode, nextVersion, syncGradleVersion } from "./version.mjs";

const WORKSPACES = ["backend", "frontend", "shared"];
const GRADLE_FILE = "frontend/android/app/build.gradle";

function readText(root, file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

// Conserve les fins de ligne du fichier (CRLF possible sur un poste Windows).
function writeText(root, file, text, original) {
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  fs.writeFileSync(path.join(root, file), text.replace(/\r?\n/g, eol));
}

function updateJson(root, file, update) {
  const original = readText(root, file);
  const data = JSON.parse(original);
  update(data);
  writeText(root, file, `${JSON.stringify(data, null, 2)}\n`, original);
}

export function bumpVersion(root, part = "patch") {
  const current = JSON.parse(readText(root, "package.json")).version;
  const version = nextVersion(current, part);

  for (const file of ["package.json", ...WORKSPACES.map((workspace) => `${workspace}/package.json`)]) {
    updateJson(root, file, (data) => { data.version = version; });
  }
  updateJson(root, "package-lock.json", (lock) => {
    lock.version = version;
    for (const key of ["", ...WORKSPACES]) {
      if (!lock.packages?.[key]) throw new Error(`Entrée "${key}" absente de package-lock.json`);
      lock.packages[key].version = version;
    }
  });

  const gradle = readText(root, GRADLE_FILE);
  writeText(root, GRADLE_FILE, syncGradleVersion(gradle, version), gradle);

  return { previous: current, version, versionCode: androidVersionCode(version) };
}

if (import.meta.main) {
  try {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
    const { previous, version, versionCode } = bumpVersion(root, process.argv[2] ?? "patch");
    console.log(`Version ${previous} -> ${version} (versionCode ${versionCode})`);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nversion_code=${versionCode}\n`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
