import type express from "express";
import type { NewsArticle, NewsLanguage } from "@pea/shared";

/**
 * Normalise la liste de langues de news demandee.
 */
export function parseNewsLanguages(value: unknown, fallback: NewsLanguage[] = ["fr"]): NewsLanguage[] {
  const raw = Array.isArray(value) ? value.flatMap((item) => String(item).split(",")) : String(value ?? "").split(",");
  const languages = [...new Set(raw.map((item) => item.trim().toLowerCase()).filter((item): item is NewsLanguage => item === "fr" || item === "en"))];
  return languages.length ? languages : fallback;
}

/**
 * Lit les langues de news effectives pour un utilisateur.
 */
export function userNewsLanguages(req: express.Request): NewsLanguage[] {
  return parseNewsLanguages(req.query.languages, req.user?.newsLanguages?.length ? req.user.newsLanguages : ["fr"]);
}

/**
 * Trie les articles du plus recent au plus ancien.
 */
export function sortArticlesByDateDesc(articles: NewsArticle[]) {
  return [...articles].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });
}
