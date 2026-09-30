import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HttpError } from "../../utils/http-error.js";

/** Durée maximale d'analyse d'un PDF : un fichier piégé ne peut pas occuper un processus indéfiniment. */
const pdfExtractionTimeoutMs = 30_000;
const childScript = fileURLToPath(new URL("./pdf-text.child.js", import.meta.url));

type ChildReply = { text: string } | { error: string };

/**
 * Extrait le texte brut d'un PDF dans un processus enfant : l'analyse ne bloque pas la boucle
 * d'évènements du serveur et un plantage du module natif de pdf-parse (@napi-rs/canvas) reste
 * confiné à l'enfant, ce qu'un worker_thread ne garantit pas.
 */
export function extractPdfText(buffer: Buffer, timeoutMs = pdfExtractionTimeoutMs): Promise<string> {
  const child = fork(childScript, { serialization: "advanced", stdio: ["ignore", "ignore", "inherit", "ipc"] });
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      outcome();
      if (child.exitCode === null) child.kill();
    };
    const timeout = setTimeout(() => { settle(() => { reject(new HttpError(400, "Analyse du PDF trop longue.")); }); }, timeoutMs);
    child.once("message", (reply: ChildReply) => {
      settle(() => { if ("text" in reply) resolve(reply.text); else reject(new HttpError(400, "PDF illisible.", { cause: reply.error })); });
    });
    child.once("error", (error) => { settle(() => { reject(new HttpError(400, "PDF illisible.", { cause: error.message })); }); });
    child.once("exit", (code, signal) => { settle(() => { reject(new HttpError(400, "PDF illisible.", { exitCode: code, signal })); }); });
    child.send(new Uint8Array(buffer));
  });
}
