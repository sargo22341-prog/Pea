import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const passwordHashRounds = 12;
let dummyPasswordHash: Promise<string> | undefined;

export function hashPassword(password: string) {
  return bcrypt.hash(password, passwordHashRounds);
}

/**
 * Compare un mot de passe à son empreinte. Sans empreinte (identifiant inconnu), la comparaison
 * se fait contre une empreinte factice : la réponse coûte le même bcrypt qu'un mauvais mot de
 * passe et ne révèle pas quels comptes existent.
 */
export async function verifyPassword(password: string, passwordHash: string | undefined) {
  dummyPasswordHash ??= hashPassword(crypto.randomBytes(16).toString("hex"));
  const matches = await bcrypt.compare(password, passwordHash ?? (await dummyPasswordHash));
  return passwordHash !== undefined && matches;
}
