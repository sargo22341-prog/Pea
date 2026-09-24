import assert from "node:assert/strict";
import test from "node:test";
import { androidVersionCode, nextVersion, syncGradleVersion } from "../version.mjs";

test("nextVersion incrémente la partie demandée et remet à zéro les parties inférieures", () => {
  assert.equal(nextVersion("1.0.21"), "1.0.22");
  assert.equal(nextVersion("1.0.21", "minor"), "1.1.0");
  assert.equal(nextVersion("1.4.21", "major"), "2.0.0");
});

test("nextVersion refuse une version illisible, une partie inconnue et un dépassement du versionCode", () => {
  assert.throws(() => nextVersion("1.0"), /illisible/);
  assert.throws(() => nextVersion("1.0.21-1"), /illisible/);
  assert.throws(() => nextVersion("1.0.21", "build"), /inconnue/);
  assert.throws(() => nextVersion("1.0.99"), /hors limites/);
});

test("androidVersionCode reste compatible avec les APK déjà publiés et croît avec la version", () => {
  assert.equal(androidVersionCode("1.0.21"), 1002100);
  assert.ok(androidVersionCode("1.1.0") > androidVersionCode("1.0.98"));
  assert.ok(androidVersionCode("2.0.0") > androidVersionCode("1.99.99"));
});

test("syncGradleVersion remplace les valeurs par défaut sans toucher au reste du fichier", () => {
  const gradle = [
    "apply plugin: 'com.android.application'",
    "",
    'def androidVersionName = System.getenv("ANDROID_VERSION_NAME") ?: "1.0.21"',
    'def androidVersionCode = (System.getenv("ANDROID_VERSION_CODE") ?: "1002100") as int',
    "def other = 1",
  ].join("\n");

  const synced = syncGradleVersion(gradle, "1.0.22");

  assert.match(synced, /\?: "1\.0\.22"$/m);
  assert.match(synced, /\?: "1002200"\) as int$/m);
  assert.match(synced, /^def other = 1$/m);
  assert.throws(() => syncGradleVersion("def other = 1", "1.0.22"), /absente de build\.gradle/);
});
