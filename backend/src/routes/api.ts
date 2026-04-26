import express from "express";
import { z } from "zod";
import type { AssetDetails, AssetMarketInfo, DividendEvent, EnrichedSearchResult, HistoryPoint, NewsArticle, NewsLanguage, Quote } from "@pea/shared";
import { HttpError } from "../utils/http-error.js";
import { parseRange } from "../utils/range.js";
import { dividendService } from "../services/dividend.service.js";
import { portfolioService } from "../services/portfolio.service.js";
import { portfolioAnalysisService } from "../services/portfolio-analysis.service.js";
import { isMarketDataUnavailable, yahooService } from "../services/yahoo.service.js";
import { watchlistService } from "../services/watchlist.service.js";
import { db } from "../db.js";
import { evaluatePeaEligibility, rankAssetForPea } from "../services/peaEligibility.js";
import { attachUser, clearAuthCookie, readCookie, requireAuth, setAuthCookie } from "../middleware/auth.js";
import { authCookieName, authService } from "../services/auth.service.js";
import { iconService } from "../services/icon.service.js";
import { confirmBoursoramaImport, confirmBoursoramaUpdate, previewBoursoramaImport, previewBoursoramaUpdate } from "../services/importBoursorama.service.js";
import { confirmAvisOperesImport, previewAvisOperesImport } from "../services/importAvisOperes.service.js";
import { localPeaSearchService } from "../services/local-pea-search.service.js";
import { logger } from "../services/logger.service.js";

export const apiRouter = express.Router();

const asyncRoute =
  (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

function parseMultipartIcon(req: express.Request) {
  const contentType = req.headers["content-type"] ?? "";
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType))?.[1] ?? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType))?.[2];
  if (!boundary || !Buffer.isBuffer(req.body)) throw new HttpError(400, "Fichier image requis.");

  const body = req.body as Buffer;
  const marker = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = body.indexOf(marker);
  while (start !== -1) {
    const next = body.indexOf(marker, start + marker.length);
    if (next === -1) break;
    parts.push(body.subarray(start + marker.length, next));
    start = next;
  }

  for (const rawPart of parts) {
    const part = trimMultipartPart(rawPart);
    const separator = part.indexOf(Buffer.from("\r\n\r\n"));
    if (separator === -1) continue;
    const headers = part.subarray(0, separator).toString("utf8");
    if (!/name="icon"/i.test(headers) && !/filename="/i.test(headers)) continue;
    const mimeType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase() ?? "application/octet-stream";
    const buffer = part.subarray(separator + 4);
    if (!buffer.length) throw new HttpError(400, "Fichier image vide.");
    return { buffer, mimeType };
  }

  throw new HttpError(400, "Fichier image requis.");
}

function parseMultipartFiles(req: express.Request, fieldName: string) {
  const contentType = req.headers["content-type"] ?? "";
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType))?.[1] ?? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType))?.[2];
  if (!boundary || !Buffer.isBuffer(req.body)) throw new HttpError(400, "Fichier requis.");

  const body = req.body as Buffer;
  const marker = Buffer.from(`--${boundary}`);
  const files: Array<{ fileName: string; buffer: Buffer }> = [];
  let start = body.indexOf(marker);
  while (start !== -1) {
    const next = body.indexOf(marker, start + marker.length);
    if (next === -1) break;
    const part = trimMultipartPart(body.subarray(start + marker.length, next));
    const separator = part.indexOf(Buffer.from("\r\n\r\n"));
    if (separator !== -1) {
      const headers = part.subarray(0, separator).toString("utf8");
      const field = /name="([^"]+)"/i.exec(headers)?.[1];
      const fileName = /filename="([^"]+)"/i.exec(headers)?.[1];
      if (field === fieldName && fileName) {
        files.push({ fileName, buffer: part.subarray(separator + 4) });
      }
    }
    start = next;
  }
  if (!files.length) throw new HttpError(400, "Aucun PDF fourni.");
  return files;
}

function trimMultipartPart(part: Buffer) {
  let start = 0;
  let end = part.length;
  while (start < end && (part[start] === 13 || part[start] === 10)) start += 1;
  while (end > start && (part[end - 1] === 13 || part[end - 1] === 10 || part[end - 1] === 45)) end -= 1;
  return part.subarray(start, end);
}

function parseNewsLanguages(value: unknown, fallback: NewsLanguage[] = ["fr"]): NewsLanguage[] {
  const raw = Array.isArray(value) ? value.flatMap((item) => String(item).split(",")) : String(value ?? "").split(",");
  const languages = [...new Set(raw.map((item) => item.trim().toLowerCase()).filter((item): item is NewsLanguage => item === "fr" || item === "en"))];
  return languages.length ? languages : fallback;
}

function userNewsLanguages(req: express.Request): NewsLanguage[] {
  return parseNewsLanguages(req.query.languages, req.user?.newsLanguages?.length ? req.user.newsLanguages : ["fr"]);
}

function sortArticlesByDateDesc(articles: NewsArticle[]) {
  return [...articles].sort((a, b) => {
    const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return bTime - aTime;
  });
}

apiRouter.use(attachUser);

apiRouter.get("/auth/me", asyncRoute(async (req, res) => {
  res.json({ user: req.user ?? null, setupRequired: !authService.hasUsers() });
}));

apiRouter.post("/auth/setup", asyncRoute(async (req, res) => {
  const body = z.object({
    username: z.string().trim().min(1),
    password: z.string().min(1),
    confirmPassword: z.string().min(1),
    profileIconUrl: z.string().url().optional().or(z.literal(""))
  }).parse(req.body);
  if (body.password !== body.confirmPassword) throw new HttpError(400, "Les mots de passe ne correspondent pas.");
  const result = await authService.setup(body.username, body.password, body.profileIconUrl || undefined);
  logger.debug("auth", "setup success", { username: result.user.username, userId: result.user.id });
  setAuthCookie(res, result.token);
  res.status(201).json(result.user);
}));

apiRouter.post("/auth/login", asyncRoute(async (req, res) => {
  const body = z.object({ username: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
  let result: Awaited<ReturnType<typeof authService.login>>;
  try {
    result = await authService.login(body.username, body.password);
    logger.debug("auth", "login success", { username: result.user.username, userId: result.user.id });
  } catch (error) {
    logger.debug("auth", "login fail", { username: body.username, error: error instanceof Error ? error.message : "unknown error" });
    throw error;
  }
  setAuthCookie(res, result.token);
  res.json(result.user);
}));

apiRouter.post("/auth/logout", asyncRoute(async (req, res) => {
  authService.logout(readCookie(req, authCookieName));
  logger.debug("auth", "logout", { userId: req.user?.id, username: req.user?.username });
  clearAuthCookie(res);
  res.status(204).send();
}));

apiRouter.patch("/auth/me", requireAuth, asyncRoute(async (req, res) => {
  const body = z.object({
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    confirmPassword: z.string().optional(),
    profileIconUrl: z.string().url().optional().or(z.literal("")).nullable(),
    dashboardDefaultSortKey: z.enum(["name", "currentMarketValue", "intervalPerformancePercent"]).optional(),
    dashboardDefaultSortDirection: z.enum(["asc", "desc"]).optional(),
    defaultChartRange: z.enum(["1d", "1w", "1m", "1y", "ytd", "max"]).optional(),
    localPeaSearchEnabled: z.boolean().optional(),
    assetNewsEnabled: z.boolean().optional(),
    newsLanguages: z.array(z.enum(["fr", "en"])).optional()
  }).parse(req.body);
  if (body.password && body.password !== body.confirmPassword) throw new HttpError(400, "Les mots de passe ne correspondent pas.");
  const updated = await authService.updateUser(req.user!.id, body);
  logger.debug("auth", "user updated", {
    userId: updated.id,
    username: updated.username,
    passwordChanged: Boolean(body.password),
    localPeaSearchEnabled: updated.localPeaSearchEnabled,
    assetNewsEnabled: updated.assetNewsEnabled,
    newsLanguages: updated.newsLanguages.join(",")
  });
  res.json(updated);
}));

apiRouter.get("/auth/me/profile-icon", requireAuth, asyncRoute(async (req, res) => {
  const icon = authService.getProfileIconFile(req.user!.id);
  if (!icon) {
    res.status(404).json({ message: "Icone de profil absente." });
    return;
  }
  res.type(icon.mimeType).sendFile(icon.filePath);
}));

apiRouter.post(
  "/auth/me/profile-icon",
  requireAuth,
  express.raw({ type: "multipart/form-data", limit: "1100kb" }),
  asyncRoute(async (req, res) => {
    const upload = parseMultipartIcon(req);
    if (!authService.isAllowedProfileIconMime(upload.mimeType)) throw new HttpError(400, "Type d'image non supporte.");
    if (upload.buffer.length > 1024 * 1024) throw new HttpError(400, "Image trop lourde, maximum 1MB.");
    logger.debug("auth", "profile icon upload", { userId: req.user!.id, mimeType: upload.mimeType, size: upload.buffer.length });
    res.json(authService.saveProfileIcon(req.user!.id, upload.buffer, upload.mimeType));
  })
);

apiRouter.delete("/auth/me/profile-icon", requireAuth, asyncRoute(async (req, res) => {
  authService.deleteProfileIcon(req.user!.id);
  logger.debug("auth", "profile icon delete", { userId: req.user!.id });
  res.status(204).send();
}));

apiRouter.use(requireAuth);

apiRouter.get("/search/enriched", asyncRoute(async (req, res) => {
  const totalStartedAt = performance.now();
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) throw new HttpError(400, "Le paramètre q est requis");

  if (req.user?.localPeaSearchEnabled) {
    const localStartedAt = performance.now();
    const enriched = localPeaSearchService.search(q);
    logger.debug("search", "local PEA search", { q, results: enriched.length, totalMs: Math.round(performance.now() - localStartedAt) });
    res.json(enriched);
    return;
  }

  const searchStartedAt = performance.now();
  const result = await yahooService.search(q);
  const searchMs = performance.now() - searchStartedAt;
  const items = result.data.filter((item) => typeof item.symbol === "string" && item.symbol.trim());
  const symbols = items.map((item) => item.symbol.trim().toUpperCase());

  const quoteStartedAt = performance.now();
  const quotes = await yahooService.quoteCombine(symbols);
  const quoteMs = performance.now() - quoteStartedAt;
  const quoteBySymbol = new Map(quotes.data.map((quote) => [quote.symbol.toUpperCase(), quote]));

  const dbStartedAt = performance.now();
  const watchlistSymbols = new Set(db.prepare("SELECT symbol FROM watchlist").all().map((row: any) => String(row.symbol).toUpperCase()));
  const portfolioSymbols = new Set(db.prepare("SELECT symbol FROM positions").all().map((row: any) => String(row.symbol).toUpperCase()));
  const dbMs = performance.now() - dbStartedAt;

  const enriched: EnrichedSearchResult[] = items.map((item) => {
    const symbol = item.symbol.trim().toUpperCase();
    const quote = quoteBySymbol.get(symbol);
    return {
      symbol,
      name: quote?.name ?? item.name,
      exchange: quote?.exchange ?? item.exchange,
      quoteType: quote?.quoteType ?? item.quoteType,
      currency: quote?.currency ?? item.currency,
      price: quote?.price,
      regularMarketChangePercent: quote?.changePercent,
      isInWatchlist: watchlistSymbols.has(symbol),
      isInPortfolio: portfolioSymbols.has(symbol)
    };
  });

  logger.debug("search", "search timing", {
    q,
    results: enriched.length,
    searchMs: Math.round(searchMs),
    quoteMs: Math.round(quoteMs),
    dbMs: Math.round(dbMs),
    totalMs: Math.round(performance.now() - totalStartedAt)
  });

  res.json(enriched);
}));

apiRouter.get("/search", asyncRoute(async (req, res) => {
  const result = await yahooService.search(String(req.query.q ?? ""));
  res.json(result.data.map((item) => ({ ...item, stale: result.stale })));
}));

apiRouter.get("/quote/:symbol", asyncRoute(async (req, res) => {
  const result = await yahooService.quote(req.params.symbol);
  res.json(result.data);
}));

apiRouter.get("/history/:symbol", asyncRoute(async (req, res) => {
  const result = await yahooService.history(req.params.symbol, parseRange(req.query.range));
  res.json(result.data);
}));

apiRouter.get("/dividends/:symbol", asyncRoute(async (req, res) => {
  const result = await yahooService.dividends(req.params.symbol);
  res.json(result.data);
}));

apiRouter.get("/news-global", asyncRoute(async (req, res) => {
  if (!req.user!.assetNewsEnabled) {
    res.json({ articles: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    return;
  }
  const page = Math.max(1, z.coerce.number().int().optional().default(1).parse(req.query.page));
  res.json(await yahooService.globalNews(page, userNewsLanguages(req)));
}));

apiRouter.get("/news-assets", asyncRoute(async (req, res) => {
  if (!req.user!.assetNewsEnabled) {
    res.json([]);
    return;
  }
  const positions = portfolioService.listPositions();
  if (!positions.length) {
    res.json([]);
    return;
  }
  const positionsBySymbol = new Map(positions.map((position) => [position.symbol.toUpperCase(), position]));
  const results = await Promise.all(
    positions.map((position) =>
      yahooService.news(position.symbol, userNewsLanguages(req)).catch((error) => {
        logger.warn("news", "asset feed fallback", { symbol: position.symbol, error: error instanceof Error ? error.message : String(error) });
        return { data: [] as NewsArticle[] };
      })
    )
  );
  const articlesByUrl = new Map<string, NewsArticle>();
  for (let index = 0; index < positions.length; index += 1) {
    const position = positions[index];
    for (const article of results[index].data) {
      const existing = articlesByUrl.get(article.url);
      const relatedAssets = existing?.relatedAssets ?? [];
      if (!relatedAssets.some((asset) => asset.symbol === position.symbol)) {
        relatedAssets.push({ symbol: position.symbol, name: positionsBySymbol.get(position.symbol.toUpperCase())?.name ?? position.name });
      }
      articlesByUrl.set(article.url, { ...(existing ?? article), relatedAssets });
    }
  }
  res.json(sortArticlesByDateDesc([...articlesByUrl.values()]).slice(0, 200));
}));

apiRouter.get("/news/:symbol", asyncRoute(async (req, res) => {
  if (!req.user!.assetNewsEnabled) {
    res.json([]);
    return;
  }
  const result = await yahooService.news(req.params.symbol, userNewsLanguages(req));
  res.json(result.data);
}));

apiRouter.get("/assets/:symbol/icon", asyncRoute(async (req, res) => {
  let icon = iconService.getIconFile(req.params.symbol);
  if (icon?.filePath && icon.mimeType) {
    res.type(icon.mimeType).sendFile(icon.filePath);
    return;
  }

  await iconService.fetchAndStoreIcon(req.params.symbol);
  icon = iconService.getIconFile(req.params.symbol);
  if (icon?.filePath && icon.mimeType) {
    res.type(icon.mimeType).sendFile(icon.filePath);
    return;
  }

  res.type("image/svg+xml").send(iconService.placeholder(req.params.symbol));
}));

apiRouter.post(
  "/assets/:symbol/icon",
  express.raw({ type: "multipart/form-data", limit: "1100kb" }),
  asyncRoute(async (req, res) => {
    const upload = parseMultipartIcon(req);
    if (!iconService.isAllowedImageMime(upload.mimeType)) throw new HttpError(400, "Type d'image non supporte.");
    if (upload.buffer.length > 1024 * 1024) throw new HttpError(400, "Image trop lourde, maximum 1MB.");
    logger.debug("icons", "icon upload", { symbol: req.params.symbol.toUpperCase(), mimeType: upload.mimeType, size: upload.buffer.length });
    res.json(await iconService.saveIconFromBuffer(req.params.symbol, upload.buffer, upload.mimeType, "manual"));
  })
);

apiRouter.delete("/assets/:symbol/icon", asyncRoute(async (req, res) => {
  iconService.resetIcon(req.params.symbol);
  logger.debug("icons", "icon delete", { symbol: req.params.symbol.toUpperCase() });
  res.status(204).send();
}));

apiRouter.get("/asset-icons", asyncRoute(async (_req, res) => {
  res.json(iconService.listKnownAssets());
}));

apiRouter.get("/portfolio", asyncRoute(async (req, res) => {
  const range = req.query.range === undefined ? req.user!.defaultChartRange : parseRange(req.query.range);
  logger.debug("portfolio", "summary requested", { range, userId: req.user!.id });
  res.json(await portfolioService.summary(range));
}));

apiRouter.get("/portfolio/analysis", asyncRoute(async (req, res) => {
  logger.debug("portfolio", "analysis requested", { userId: req.user!.id });
  res.json(await portfolioAnalysisService.analysis());
}));

apiRouter.post("/portfolio/positions", asyncRoute(async (req, res) => {
  const body = z
    .object({
      symbol: z.string(),
      name: z.string().optional(),
      quantity: z.coerce.number().positive(),
      averageBuyPrice: z.coerce.number().nonnegative(),
      currency: z.string().default("EUR")
    })
    .parse(req.body);

  res.status(201).json(await portfolioService.createPosition(body));
}));

apiRouter.put("/portfolio/positions/:id", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const body = z
    .object({
      quantity: z.coerce.number().positive(),
      averageBuyPrice: z.coerce.number().nonnegative(),
      currency: z.string().default("EUR"),
      notes: z.string().optional()
    })
    .parse(req.body);

  res.json(await portfolioService.updatePosition(id, body));
}));

apiRouter.get("/portfolio/positions/:id/transactions", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  res.json(portfolioService.listTransactions(id));
}));

apiRouter.put("/portfolio/positions/:id/transactions/:transactionId", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const transactionId = z.coerce.number().int().positive().parse(req.params.transactionId);
  const body = z.object({
    tradedAt: z.string().min(1),
    type: z.enum(["buy", "sell"]),
    quantity: z.coerce.number().nonnegative(),
    price: z.coerce.number().nonnegative(),
    totalFees: z.coerce.number().nonnegative().optional(),
    currency: z.string().min(3).max(8).default("EUR")
  }).parse(req.body);
  res.json(portfolioService.updateTransaction(id, transactionId, body));
}));

apiRouter.delete("/portfolio/positions/:id/transactions/:transactionId", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const transactionId = z.coerce.number().int().positive().parse(req.params.transactionId);
  portfolioService.deleteTransaction(id, transactionId);
  res.status(204).send();
}));

apiRouter.delete("/portfolio/positions/:id", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const deleted = portfolioService.deletePosition(id);
  if (!deleted) throw new HttpError(404, "Position introuvable");
  res.status(204).send();
}));

apiRouter.get("/portfolio/performance", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  logger.debug("portfolio", "performance requested", { range, userId: req.user!.id });
  res.json(await portfolioService.performance(range));
}));

apiRouter.get("/portfolio/positions/performance", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  logger.debug("portfolio", "positions performance requested", { range, userId: req.user!.id });
  res.json(await portfolioService.positionsPerformance(range));
}));

apiRouter.get("/portfolio/dividends", asyncRoute(async (_req, res) => {
  res.json(await dividendService.portfolioDividends());
}));

apiRouter.post("/import/boursorama/preview", asyncRoute(async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  const preview = await previewBoursoramaImport(body.content);
  logger.debug("import", "CSV preview", { rows: preview.length, rowsFailed: preview.filter((row) => row.errors.length).length });
  res.json(preview);
}));

apiRouter.post("/import/boursorama/confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(z.any()) }).parse(req.body);
  const result = await confirmBoursoramaImport(body.rows);
  logger.debug("import", "CSV confirm", { rows: body.rows.length, imported: result.imported.length, skipped: result.skipped.length, errors: result.errors.length });
  res.json(result);
}));

apiRouter.post("/import/boursorama/update-preview", asyncRoute(async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  const preview = await previewBoursoramaUpdate(body.content);
  logger.debug("import", "CSV update preview", {
    rows: preview.length,
    rowsFailed: preview.filter((row) => row.errors.length).length,
    actions: preview.reduce<Record<string, number>>((counts, row) => {
      counts[row.proposedAction] = (counts[row.proposedAction] ?? 0) + 1;
      return counts;
    }, {})
  });
  res.json(preview);
}));

apiRouter.post("/import/boursorama/update-confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(z.any()) }).parse(req.body);
  const result = await confirmBoursoramaUpdate(body.rows);
  logger.debug("import", "CSV update confirm", { rows: body.rows.length, imported: result.imported.length, skipped: result.skipped.length, errors: result.errors.length });
  res.json(result);
}));

apiRouter.post(
  "/import/avis-operes/preview",
  express.raw({ type: "multipart/form-data", limit: "10mb" }),
  asyncRoute(async (req, res) => {
    const files = parseMultipartFiles(req, "files");
    const preview = await previewAvisOperesImport(files);
    logger.debug("import", "PDF avis preview", { files: files.length, rows: preview.length, rowsWithWarnings: preview.filter((row) => row.warnings.length).length });
    res.json(preview);
  })
);

apiRouter.post("/import/avis-operes/confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(z.any()) }).parse(req.body);
  const result = await confirmAvisOperesImport(body.rows);
  logger.debug("import", "PDF avis confirm", { rows: body.rows.length, imported: result.imported.length, skipped: result.skipped.length, errors: result.errors.length });
  res.json(result);
}));

apiRouter.get("/watchlist", asyncRoute(async (req, res) => {
  res.json(await watchlistService.list(parseRange(req.query.range)));
}));

apiRouter.post("/watchlist/:symbol", asyncRoute(async (req, res) => {
  const body = z
    .object({
      name: z.string().optional(),
      exchange: z.string().optional(),
      currency: z.string().optional()
    })
    .partial()
    .parse(req.body ?? {});

  res.status(201).json(await watchlistService.add(req.params.symbol, body));
}));

apiRouter.delete("/watchlist/:symbol", asyncRoute(async (req, res) => {
  const deleted = watchlistService.remove(req.params.symbol);
  if (!deleted) throw new HttpError(404, "Actif absent de la liste de suivi");
  res.status(204).send();
}));

apiRouter.get("/assets/:symbol", asyncRoute(async (req, res) => {
  const range = parseRange(req.query.range);
  const symbol = req.params.symbol.toUpperCase();
  const positionPromise = portfolioService.getPosition(symbol);
  const watchlistRow = db.prepare("SELECT id FROM watchlist WHERE symbol = ?").get(symbol);
  let marketUnavailable = false;

  const position = await positionPromise;

  const quoteResult = await yahooService.quote(symbol).catch((error) => {
    if (!isMarketDataUnavailable(error)) throw error;
    marketUnavailable = true;
    return {
      data: {
        symbol,
        name: position?.name ?? symbol,
        price: position?.averageBuyPrice ?? 0,
        currency: position?.currency ?? "EUR",
        stale: true,
        unavailable: true
      } satisfies Quote
    };
  });
  const quote: Quote = quoteResult.data;

  const [historyResult, dividendsResult, newsResult, marketInfoResult, assetFinancialsResult] = await Promise.all([
    yahooService.history(symbol, range).catch((error) => {
      if (!isMarketDataUnavailable(error)) throw error;
      marketUnavailable = true;
      return { data: [] as HistoryPoint[] };
    }),
    yahooService.dividends(symbol).catch((error) => {
      if (!isMarketDataUnavailable(error)) throw error;
      marketUnavailable = true;
      return { data: [] as DividendEvent[] };
    }),
    req.user!.assetNewsEnabled
      ? yahooService.news(symbol, userNewsLanguages(req)).catch((error) => {
          logger.warn("news", "asset news fallback", { symbol, error: error instanceof Error ? error.message : String(error) });
          return { data: [] as NewsArticle[] };
        })
      : Promise.resolve({ data: [] as NewsArticle[] }),
    yahooService.marketInfo(symbol).catch((error) => {
      if (!isMarketDataUnavailable(error)) throw error;
      marketUnavailable = true;
      return { data: {} as AssetMarketInfo };
    }),
    portfolioAnalysisService.assetFinancials(symbol, quote.name).catch((error) => {
      logger.warn("portfolio", "asset financials fallback", { symbol, error: error instanceof Error ? error.message : String(error) });
      return { financials: [] as AssetDetails["financials"], isEtf: false };
    })
  ]);

  const history = historyResult.data;
  const dividends = dividendsResult.data;
  const news = newsResult.data;
  const marketInfo = marketInfoResult.data;
  const financials = assetFinancialsResult.financials;
  const isEtf = assetFinancialsResult.isEtf;
  const dividendsReceived = position
    ? dividends.reduce((sum, event) => {
        if (new Date(event.date).getTime() > Date.now()) return sum;
        const quantity = portfolioService.hasDatedTransactions(position.id)
          ? portfolioService.getQuantityHeldAtDate(position.id, event.date)
          : position.quantity;
        return sum + quantity * event.amount;
      }, 0)
    : 0;

  const details: AssetDetails = {
    quote,
    history,
    dividends,
    news,
    position,
    positionStats: position ? portfolioService.transactionStats(position.id, dividendsReceived, position.currency) : undefined,
    isInWatchlist: Boolean(watchlistRow),
    stale: marketUnavailable || quote.stale || history.some((point) => point.stale) || dividends.some((event) => event.stale) || position?.quote?.stale,
    peaEligibility: evaluatePeaEligibility({ ...quote, quoteType: String(quote.quoteType ?? "") }),
    peaRank: rankAssetForPea({ ...quote, quoteType: String(quote.quoteType ?? "") }),
    summary: {
      exchange: quote.exchange,
      marketState: quote.marketState,
      dividendYield: quote.dividendYield,
      dividendRate: quote.dividendRate
    },
    marketInfo,
    financials,
    isEtf
  };

  res.json(details);
}));

apiRouter.use((req) => {
  throw new HttpError(404, `Route API introuvable: ${req.method} ${req.path}`);
});
