import type { NewsLanguage } from "@pea/shared";
import { authRepository } from "../../repositories/auth/auth.repository.js";
import { rowToAuthUser } from "../auth/auth-user.mapper.js";
import { logger } from "../shared/logger.service.js";
import { prefetchCompanyNews, prefetchGlobalNews } from "../yahoo/news/news.job.js";
import { listAssetNewsCandidates, listAssetNewsPositions } from "./asset-news-candidates.js";

export interface NewsPrefetchResult {
  users: number;
  companies: number;
  refreshedFeeds: number;
  failedFeeds: number;
}

interface CompanyFeedRequest {
  symbol: string;
  query: string;
  languages: Set<NewsLanguage>;
}

/** Flux à précharger : chaque action détenue une fois, dans l'union des langues de ses détenteurs. */
function collectPrefetchTargets() {
  const users = authRepository.listUsers().map(rowToAuthUser).filter((user) => user.assetNewsEnabled);
  const globalLanguages = new Set<NewsLanguage>();
  const companies = new Map<string, CompanyFeedRequest>();
  for (const user of users) {
    for (const language of user.newsLanguages) globalLanguages.add(language);
    for (const candidate of listAssetNewsCandidates(listAssetNewsPositions(user.id)).candidates) {
      const key = `${candidate.symbol.toUpperCase()}|${candidate.query}`;
      const request = companies.get(key) ?? { symbol: candidate.symbol, query: candidate.query, languages: new Set<NewsLanguage>() };
      for (const language of user.newsLanguages) request.languages.add(language);
      companies.set(key, request);
    }
  }
  return { users: users.length, globalLanguages: [...globalLanguages], companies: [...companies.values()] };
}

/**
 * Rafraîchit, avec la priorité la plus basse de la file Yahoo, les flux d'actualités des actions
 * détenues et le flux global plus vieux que `maxAgeSeconds`. Les flux sont traités un par un :
 * un échec est journalisé sans interrompre les suivants, un `signal` annulé arrête la boucle.
 */
export async function prefetchUsersNews(maxAgeSeconds: number, signal?: AbortSignal): Promise<NewsPrefetchResult> {
  const targets = collectPrefetchTargets();
  const result: NewsPrefetchResult = { users: targets.users, companies: targets.companies.length, refreshedFeeds: 0, failedFeeds: 0 };
  const jobs = [
    ...targets.companies.map((company) => ({
      context: { symbol: company.symbol, query: company.query },
      run: () => prefetchCompanyNews(company.symbol, company.query, [...company.languages], maxAgeSeconds)
    })),
    ...(targets.globalLanguages.length
      ? [{ context: { feed: "global" }, run: () => prefetchGlobalNews(targets.globalLanguages, maxAgeSeconds) }]
      : [])
  ];
  for (const job of jobs) {
    if (signal?.aborted) break;
    try {
      result.refreshedFeeds += await job.run();
    } catch (error) {
      result.failedFeeds += 1;
      logger.warn("news", "news prefetch failed", { ...job.context, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}
