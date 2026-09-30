import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** Prérequis commun : sans lui, aucune suite ne peut tourner. */
export const prerequisite = { name: "build shared", args: ["run", "build", "-w", "shared"] };

/** Suites indépendantes : un échec backend ne doit pas masquer le résultat frontend. */
export const suites = [
  { name: "backend", args: ["test", "-w", "backend"] },
  { name: "frontend", args: ["test", "-w", "frontend"] },
  { name: "scripts", args: ["run", "test:scripts"] }
];

/** Exécute toutes les suites après le prérequis et renvoie celles qui ont échoué. */
export function runAll(run) {
  if (!run(prerequisite)) return [prerequisite.name];
  return suites.filter((suite) => !run(suite)).map((suite) => suite.name);
}

/**
 * Lancé par `npm test`, npm fournit son propre point d'entrée : aucun shell n'est nécessaire.
 * En appel direct, la commande (arguments constants) passe par le shell pour trouver npm.
 */
function runNpm({ name, args }) {
  console.log(`\n=== ${name} ===`);
  const npmCli = process.env["npm_execpath"];
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, ...args], { stdio: "inherit" })
    : spawnSync(`npm ${args.join(" ")}`, { stdio: "inherit", shell: true });
  return result.status === 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const failures = runAll(runNpm);
  if (failures.length) {
    console.error(`\nSuites en echec : ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nToutes les suites de tests sont passees.");
  }
}
