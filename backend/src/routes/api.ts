import express from "express";
import { z } from "zod";
import type { AssetDetails, DividendEvent, EnrichedSearchResult, HistoryPoint, Quote } from "@pea/shared";
import { HttpError } from "../utils/http-error.js";
import { parseRange } from "../utils/range.js";
import { dividendService } from "../services/dividend.service.js";
import { portfolioService } from "../services/portfolio.service.js";
import { isMarketDataUnavailable, yahooService } from "../services/yahoo.service.js";
import { watchlistService } from "../services/watchlist.service.js";
import { db } from "../db.js";
import { evaluatePeaEligibility, rankAssetForPea } from "../services/peaEligibility.js";
import { attachUser, clearAuthCookie, readCookie, requireAuth, setAuthCookie } from "../middleware/auth.js";
import { authCookieName, authService } from "../services/auth.service.js";
import { iconService } from "../services/icon.service.js";
import { confirmBoursoramaImport, confirmBoursoramaUpdate, previewBoursoramaImport, previewBoursoramaUpdate } from "../services/importBoursorama.service.js";
import { localPeaSearchService } from "../services/local-pea-search.service.js";

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

function trimMultipartPart(part: Buffer) {
  let start = 0;
  let end = part.length;
  while (start < end && (part[start] === 13 || part[start] === 10)) start += 1;
  while (end > start && (part[end - 1] === 13 || part[end - 1] === 10 || part[end - 1] === 45)) end -= 1;
  return part.subarray(start, end);
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
  setAuthCookie(res, result.token);
  res.status(201).json(result.user);
}));

apiRouter.post("/auth/login", asyncRoute(async (req, res) => {
  const body = z.object({ username: z.string().trim().min(1), password: z.string().min(1) }).parse(req.body);
  const result = await authService.login(body.username, body.password);
  setAuthCookie(res, result.token);
  res.json(result.user);
}));

apiRouter.post("/auth/logout", asyncRoute(async (req, res) => {
  authService.logout(readCookie(req, authCookieName));
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
    localPeaSearchEnabled: z.boolean().optional()
  }).parse(req.body);
  if (body.password && body.password !== body.confirmPassword) throw new HttpError(400, "Les mots de passe ne correspondent pas.");
  res.json(await authService.updateUser(req.user!.id, body));
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
    res.json(authService.saveProfileIcon(req.user!.id, upload.buffer, upload.mimeType));
  })
);

apiRouter.delete("/auth/me/profile-icon", requireAuth, asyncRoute(async (req, res) => {
  authService.deleteProfileIcon(req.user!.id);
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
    console.info(`[search:local-pea] q=${q} results=${enriched.length} total=${Math.round(performance.now() - localStartedAt)}ms`);
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

  console.info(`[search] q=${q} search=${Math.round(searchMs)}ms quote=${Math.round(quoteMs)}ms db=${Math.round(dbMs)}ms total=${Math.round(performance.now() - totalStartedAt)}ms`);

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
    res.json(await iconService.saveIconFromBuffer(req.params.symbol, upload.buffer, upload.mimeType, "manual"));
  })
);

apiRouter.delete("/assets/:symbol/icon", asyncRoute(async (req, res) => {
  iconService.resetIcon(req.params.symbol);
  res.status(204).send();
}));

apiRouter.get("/asset-icons", asyncRoute(async (_req, res) => {
  res.json(iconService.listKnownAssets());
}));

apiRouter.get("/portfolio", asyncRoute(async (req, res) => {
  const range = req.query.range === undefined ? req.user!.defaultChartRange : parseRange(req.query.range);
  res.json(await portfolioService.summary(range));
}));

apiRouter.post("/portfolio/positions", asyncRoute(async (req, res) => {
  const body = z
    .object({
      symbol: z.string(),
      name: z.string().optional(),
      quantity: z.coerce.number().positive(),
      averageBuyPrice: z.coerce.number().nonnegative(),
      currency: z.string().default("EUR"),
      purchaseDate: z.string().optional()
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
      purchaseDate: z.string().optional(),
      notes: z.string().optional()
    })
    .parse(req.body);

  res.json(await portfolioService.updatePosition(id, body));
}));

apiRouter.delete("/portfolio/positions/:id", asyncRoute(async (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const deleted = portfolioService.deletePosition(id);
  if (!deleted) throw new HttpError(404, "Position introuvable");
  res.status(204).send();
}));

apiRouter.get("/portfolio/performance", asyncRoute(async (req, res) => {
  res.json(await portfolioService.performance(parseRange(req.query.range)));
}));

apiRouter.get("/portfolio/positions/performance", asyncRoute(async (req, res) => {
  res.json(await portfolioService.positionsPerformance(parseRange(req.query.range)));
}));

apiRouter.get("/portfolio/dividends", asyncRoute(async (_req, res) => {
  res.json(await dividendService.portfolioDividends());
}));

apiRouter.post("/import/boursorama/preview", asyncRoute(async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  res.json(await previewBoursoramaImport(body.content));
}));

apiRouter.post("/import/boursorama/confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(z.any()) }).parse(req.body);
  res.json(await confirmBoursoramaImport(body.rows));
}));

apiRouter.post("/import/boursorama/update-preview", asyncRoute(async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  res.json(await previewBoursoramaUpdate(body.content));
}));

apiRouter.post("/import/boursorama/update-confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(z.any()) }).parse(req.body);
  res.json(await confirmBoursoramaUpdate(body.rows));
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
  const position = await portfolioService.getPosition(symbol);
  const watchlistRow = db.prepare("SELECT id FROM watchlist WHERE symbol = ?").get(symbol);
  let marketUnavailable = false;

  let quote: Quote;
  try {
    quote = (await yahooService.quote(symbol)).data;
  } catch (error) {
    if (!isMarketDataUnavailable(error)) throw error;
    marketUnavailable = true;
    quote = {
      symbol,
      name: position?.name ?? symbol,
      price: position?.averageBuyPrice ?? 0,
      currency: position?.currency ?? "EUR",
      stale: true,
      unavailable: true
    };
  }

  let history: HistoryPoint[] = [];
  try {
    history = (await yahooService.history(symbol, range)).data;
  } catch (error) {
    if (!isMarketDataUnavailable(error)) throw error;
    marketUnavailable = true;
  }

  let dividends: DividendEvent[] = [];
  try {
    dividends = (await yahooService.dividends(symbol)).data;
  } catch (error) {
    if (!isMarketDataUnavailable(error)) throw error;
    marketUnavailable = true;
  }

  const details: AssetDetails = {
    quote,
    history,
    dividends,
    position,
    isInWatchlist: Boolean(watchlistRow),
    stale: marketUnavailable || quote.stale || history.some((point) => point.stale) || dividends.some((event) => event.stale) || position?.quote?.stale,
    peaEligibility: evaluatePeaEligibility({ ...quote, quoteType: String(quote.quoteType ?? "") }),
    peaRank: rankAssetForPea({ ...quote, quoteType: String(quote.quoteType ?? "") }),
    summary: {
      exchange: quote.exchange,
      marketState: quote.marketState,
      dividendYield: quote.dividendYield,
      dividendRate: quote.dividendRate
    }
  };

  res.json(details);
}));

apiRouter.use((req) => {
  throw new HttpError(404, `Route API introuvable: ${req.method} ${req.path}`);
});
