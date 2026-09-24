// Règles de version de l'application : semver X.Y.Z partagé par les paquets npm et l'APK Android.
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
// Le versionCode Android encode X.Y.Z sur deux chiffres par partie ; il doit toujours croître.
const MAX_MINOR_OR_PATCH = 99;
const MAJOR_WEIGHT = 1_000_000;
const MINOR_WEIGHT = 10_000;
// Facteur historique conservé : les APK déjà installés ont été publiés avec ce calcul.
const PATCH_WEIGHT = 100;

export const BUMP_PARTS = ["patch", "minor", "major"];

export function parseVersion(version) {
  const match = SEMVER_PATTERN.exec(version);
  if (!match) throw new Error(`Version illisible : "${version}" (format attendu X.Y.Z)`);
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > MAX_MINOR_OR_PATCH || patch > MAX_MINOR_OR_PATCH) {
    throw new Error(`Version ${version} hors limites : mineure et patch doivent rester <= ${MAX_MINOR_OR_PATCH}`);
  }
  return { major, minor, patch };
}

export function nextVersion(current, part = "patch") {
  const { major, minor, patch } = parseVersion(current);
  let next;
  if (part === "patch") next = `${major}.${minor}.${patch + 1}`;
  else if (part === "minor") next = `${major}.${minor + 1}.0`;
  else if (part === "major") next = `${major + 1}.0.0`;
  else throw new Error(`Partie de version inconnue : "${part}" (${BUMP_PARTS.join(", ")})`);
  parseVersion(next);
  return next;
}

export function androidVersionCode(version) {
  const { major, minor, patch } = parseVersion(version);
  return major * MAJOR_WEIGHT + minor * MINOR_WEIGHT + patch * PATCH_WEIGHT;
}

// Remplace les valeurs par défaut de build.gradle (surchargées en CI par ANDROID_VERSION_*).
export function syncGradleVersion(gradleText, version) {
  const code = androidVersionCode(version);
  const replacements = [
    [/^def androidVersionName = .*$/m, `def androidVersionName = System.getenv("ANDROID_VERSION_NAME") ?: "${version}"`],
    [/^def androidVersionCode = .*$/m, `def androidVersionCode = (System.getenv("ANDROID_VERSION_CODE") ?: "${code}") as int`],
  ];
  return replacements.reduce((text, [pattern, line]) => {
    if (!pattern.test(text)) throw new Error(`Ligne absente de build.gradle : ${pattern}`);
    return text.replace(pattern, line);
  }, gradleText);
}
