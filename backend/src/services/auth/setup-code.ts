import crypto from "node:crypto";
import { config } from "../../config.js";

/** 9 octets aléatoires donnent 12 caractères base64url, hors de portée sous la limite de débit du setup. */
const generatedSetupCodeBytes = 9;

/**
 * Code exigé pour créer le premier compte administrateur : sans lui, une instance exposée avant
 * sa configuration pourrait être revendiquée par le premier visiteur. Fourni par `SETUP_CODE`
 * ou généré à chaque démarrage et affiché dans les logs du serveur.
 */
const setupCode = config.setupCode ?? crypto.randomBytes(generatedSetupCodeBytes).toString("base64url");

export function isValidSetupCode(candidate: string) {
  const expected = Buffer.from(setupCode);
  const actual = Buffer.from(candidate);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Métadonnées de log : le code généré est affiché, jamais celui fourni par l'environnement. */
export function setupCodeLogDetails() {
  return config.setupCode ? { setupCodeSource: "SETUP_CODE" } : { setupCodeSource: "generated", setupCode };
}
