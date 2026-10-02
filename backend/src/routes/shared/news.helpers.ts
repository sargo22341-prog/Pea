import type express from "express";
import type { NewsLanguage } from "@pea/shared";
import { primitiveText } from "../../utils/text.js";

/**
 * Normalise la liste de langues de news demandee.
 */
export function parseNewsLanguages(value: unknown, fallback: NewsLanguage[] = ["fr"]): NewsLanguage[] {
  const raw = Array.isArray(value) ? value.flatMap((item) => String(item).split(",")) : primitiveText(value).split(",");
  const languages = [...new Set(raw.map((item) => item.trim().toLowerCase()).filter((item): item is NewsLanguage => item === "fr" || item === "en"))];
  return languages.length ? languages : fallback;
}

/**
 * Lit les langues de news effectives pour un utilisateur.
 */
export function userNewsLanguages(req: express.Request): NewsLanguage[] {
  return parseNewsLanguages(req.query["languages"], req.user?.newsLanguages.length ? req.user.newsLanguages : ["fr"]);
}
