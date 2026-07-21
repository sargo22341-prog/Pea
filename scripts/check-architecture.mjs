import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const sourceRoots = ["backend/src", "frontend/src", "shared/src", "scripts"];
const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);
const ignoredDirectories = new Set(["android", "dist", "node_modules", "coverage"]);
const maxFileLines = 300;
const maxFilesPerDirectory = 15;
const violations = [];

function isCodeFile(entry) {
  return entry.isFile() && codeExtensions.has(path.extname(entry.name)) && !entry.name.endsWith(".d.ts");
}

function physicalLineCount(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
}

function inspectDirectory(relativeDirectory) {
  const absoluteDirectory = path.join(projectRoot, relativeDirectory);
  const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
  const directCodeFiles = entries.filter(isCodeFile);

  if (directCodeFiles.length > maxFilesPerDirectory) {
    violations.push(`${relativeDirectory}: ${directCodeFiles.length} fichiers directs (maximum ${maxFilesPerDirectory})`);
  }

  for (const entry of directCodeFiles) {
    const relativeFile = path.join(relativeDirectory, entry.name);
    const lines = physicalLineCount(path.join(projectRoot, relativeFile));
    if (lines > maxFileLines) violations.push(`${relativeFile}: ${lines} lignes (maximum ${maxFileLines})`);
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || ignoredDirectories.has(entry.name)) continue;
    inspectDirectory(path.join(relativeDirectory, entry.name));
  }
}

for (const sourceRoot of sourceRoots) inspectDirectory(sourceRoot);

if (violations.length) {
  console.error("Architecture non conforme :");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Architecture conforme : <= ${maxFileLines} lignes par fichier et <= ${maxFilesPerDirectory} fichiers directs par dossier.`);
}
