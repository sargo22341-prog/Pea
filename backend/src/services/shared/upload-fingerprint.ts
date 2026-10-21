import { createHash } from "node:crypto";
import { HttpError } from "../../utils/http-error.js";

export const duplicateUploadMessage = "Le meme fichier a ete fourni deux fois dans le lot.";

/** Empreinte SHA-256 du contenu : deux fichiers identiques ont la même, quel que soit leur nom. */
export function contentFingerprint(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Refuse (400) un lot qui contient deux fois le même fichier (même contenu, même sous un autre
 * nom) : il serait lu deux fois. Les noms des fichiers en cause sont renvoyés dans `details`.
 */
export function assertDistinctUploads(files: readonly { fileName: string; buffer: Buffer }[]) {
  const seen = new Map<string, string>();
  for (const file of files) {
    const fingerprint = contentFingerprint(file.buffer);
    const first = seen.get(fingerprint);
    if (first !== undefined) throw new HttpError(400, duplicateUploadMessage, { code: "DUPLICATE_UPLOAD", files: [first, file.fileName] });
    seen.set(fingerprint, file.fileName);
  }
}
