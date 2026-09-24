// Notes de la prochaine release, écrites à la main dans RELEASE_NOTES.md sous la ligne marqueur.
// Usage : node scripts/release/release-notes.mjs extract <fichier>   écrit les notes (vide s'il n'y en a pas)
//         node scripts/release/release-notes.mjs reset               vide les notes en gardant l'en-tête
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const NOTES_MARKER = "<!-- notes -->";

function splitAtMarker(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const markerIndex = lines.findIndex((line) => line.trim() === NOTES_MARKER);
  if (markerIndex === -1) throw new Error(`Ligne marqueur ${NOTES_MARKER} absente de RELEASE_NOTES.md`);
  return { header: lines.slice(0, markerIndex + 1), notes: lines.slice(markerIndex + 1) };
}

// Tout ce qui suit le marqueur, sans lignes vides au début ni à la fin.
export function extractNotes(text) {
  const notes = splitAtMarker(text).notes.join("\n").trim();
  return notes ? `${notes}\n` : "";
}

export function resetNotes(text) {
  return `${splitAtMarker(text).header.join("\n")}\n`;
}

function main([command, output]) {
  const notesFile = process.env.RELEASE_NOTES_FILE
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../RELEASE_NOTES.md");
  const text = fs.readFileSync(notesFile, "utf8");

  if (command === "extract" && output) fs.writeFileSync(output, extractNotes(text));
  else if (command === "reset") fs.writeFileSync(notesFile, resetNotes(text));
  else throw new Error("Usage : release-notes.mjs extract <fichier> | reset");
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
