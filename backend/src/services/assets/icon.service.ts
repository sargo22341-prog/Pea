/**
 * Role du fichier : gerer les icones d'actifs, depuis le cache SQLite jusqu'au
 * stockage local et aux tentatives de recuperation automatique.
 */

import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { db } from "../../db.js";
import { dedupeInFlight } from "../shared/inFlightDeduper.js";
import { logger } from "../shared/logger.service.js";
import { yahooClient } from "../yahoo/index.js";

export interface AssetIcon {
  symbol: string;
  filePath?: string;
  mimeType?: string;
  size?: number;
  source: "auto" | "manual";
  fetchStatus: "success" | "failed" | "pending";
  lastAttemptAt?: string;
  updatedAt?: string;
  hasIcon?: boolean;
}

const iconsDir = path.resolve(path.dirname(config.sqlitePath), "icons");
const maxAutoFetchMs = 3000;
const failureCooldownMs = 24 * 60 * 60 * 1000;
const etfNamePattern = /\b(ETF|UCITS|MSCI|S&P|STOXX|ISHARES|AMUNDI|LYXOR|VANGUARD|XTRACKERS)\b/i;
let logoDevConfigLogged = false;

type LogoCandidate = {
  url: string;
  source: "logo.dev ticker" | "logo.dev name" | "logo.dev website" | "favicon";
  label: string;
};

fs.mkdirSync(iconsDir, { recursive: true });

function normalizeSymbol(symbol: string) {
  return String(symbol ?? "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
}

function mapIcon(row: any): AssetIcon {
  return {
    symbol: String(row.symbol),
    filePath: row.file_path ? String(row.file_path) : undefined,
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    size: row.size === null || row.size === undefined ? undefined : Number(row.size),
    source: row.source === "manual" ? "manual" : "auto",
    fetchStatus: row.fetch_status === "success" || row.fetch_status === "failed" ? row.fetch_status : "pending",
    lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    hasIcon: Boolean(row.file_path)
  };
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  return "png";
}

function normalizeWebsite(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.origin;
  } catch {
    return undefined;
  }
}

function domainFromWebsite(value?: string) {
  const website = normalizeWebsite(value);
  if (!website) return undefined;
  return new URL(website).hostname.replace(/^www\./i, "");
}

function readCachedQuote(symbol: string): { name?: string; quoteType?: string; website?: string } | undefined {
  const row = db.prepare("SELECT payload FROM cached_quotes WHERE symbol = ?").get(normalizeSymbol(symbol)) as { payload?: string } | undefined;
  if (!row?.payload) return undefined;
  try {
    const payload = JSON.parse(String(row.payload)) as { name?: string; quoteType?: string; website?: string };
    return payload;
  } catch {
    return undefined;
  }
}

function isEtfCandidate(input: { name?: string; quoteType?: string }) {
  return String(input.quoteType ?? "").toUpperCase() === "ETF" || etfNamePattern.test(String(input.name ?? ""));
}

function placeholderSvg(symbol: string) {
  const text = normalizeSymbol(symbol).slice(0, 3) || "?";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="18" fill="#071014"/><text x="64" y="76" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#38bdf8">${text}</text></svg>`
  );
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), maxAutoFetchMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "user-agent": "PEA Portfolio" } });
  } finally {
    clearTimeout(timeout);
  }
}

export class IconService {
  iconsDir = iconsDir;

  getCached(symbol: string): AssetIcon | undefined {
    const key = normalizeSymbol(symbol);
    if (!key) return undefined;
    const row = db.prepare("SELECT * FROM asset_icons WHERE symbol = ?").get(key);
    return row ? mapIcon(row) : undefined;
  }

  getAssetIcon(symbol: string): AssetIcon | undefined {
    const key = normalizeSymbol(symbol);
    const icon = this.getCached(key);
    if (icon?.filePath && fs.existsSync(icon.filePath)) {
      logger.debug("icons", "icon cache hit", { symbol: key, source: icon.source, mimeType: icon.mimeType, size: icon.size });
      return icon;
    }
    if (this.isEtf(key)) {
      logger.debug("icons", "icon fetch skipped ETF", { symbol: key });
      return icon;
    }
    if (!this.hasRecentFailure(key) && !this.hasRecentPending(key)) void this.fetchAndStoreIcon(key);
    return icon;
  }

  getIconFile(symbol: string): AssetIcon | undefined {
    const icon = this.getCached(symbol);
    return icon?.filePath && icon.mimeType && fs.existsSync(icon.filePath) ? icon : undefined;
  }

  async saveIconFromBuffer(symbol: string, buffer: Buffer, mimeType: string, source: "auto" | "manual" = "manual"): Promise<AssetIcon> {
    const key = normalizeSymbol(symbol);
    if (!key) throw new Error("Symbole invalide.");
    const cleanMime = mimeType.toLowerCase();
    const extension = extensionForMime(cleanMime);
    const filePath = path.join(iconsDir, `${key}.${extension}`);

    for (const candidate of ["png", "jpg"]) {
      const candidatePath = path.join(iconsDir, `${key}.${candidate}`);
      if (candidatePath !== filePath && fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath);
    }

    fs.writeFileSync(filePath, buffer);
    db.prepare(
      `INSERT INTO asset_icons (symbol, file_path, mime_type, size, source, fetch_status, last_attempt_at)
       VALUES (?, ?, ?, ?, ?, 'success', CURRENT_TIMESTAMP)
       ON CONFLICT(symbol) DO UPDATE SET
        file_path = excluded.file_path,
        mime_type = excluded.mime_type,
        size = excluded.size,
        source = excluded.source,
        fetch_status = 'success',
        last_attempt_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP`
    ).run(key, filePath, cleanMime, buffer.length, source);
    logger.debug("icons", "icon saved", { symbol: key, source, mimeType: cleanMime, size: buffer.length });
    return this.getCached(key)!;
  }

  async fetchAndStoreIcon(symbol: string): Promise<AssetIcon | undefined> {
    const key = normalizeSymbol(symbol);
    if (!key) return undefined;
    if (this.getIconFile(key)) return this.getCached(key);
    if (this.isEtf(key)) return this.getCached(key);
    if (this.hasRecentFailure(key) || this.hasRecentPending(key)) return this.getCached(key);

    this.markIconPending(key);
    try {
      const metadata = this.getAssetMetadata(key);
      let website = metadata.website;
      this.logLogoDevConfig();
      if (config.logoDevApiKey) {
        const logoDevUrls = this.buildLogoDevCandidates(key, metadata.name);
        const logo = await this.fetchFirstAllowedImage(key, logoDevUrls);
        if (logo) return this.saveIconFromBuffer(key, logo.buffer, logo.mimeType, "auto");
      }

      if (!website) logger.debug("icons", "website lookup via Yahoo assetProfile", { symbol: key });
      website = website ?? (await this.getWebsiteFromYahooAssetProfile(key));
      logger.debug("icons", "website lookup result", { symbol: key, domain: domainFromWebsite(website), found: Boolean(website) });
      if (config.logoDevApiKey) {
        const domainCandidates = this.buildLogoDevDomainCandidates(website);
        if (!domainCandidates.length) logger.debug("icons", "logo.dev website skipped, no domain", { symbol: key });
        const logo = await this.fetchFirstAllowedImage(key, domainCandidates);
        if (logo) return this.saveIconFromBuffer(key, logo.buffer, logo.mimeType, "auto");
      }

      const candidates = this.buildFaviconCandidates(website);
      const favicon = await this.fetchFirstAllowedImage(key, candidates);
      if (favicon) return this.saveIconFromBuffer(key, favicon.buffer, favicon.mimeType, "auto");
      logger.debug("icons", "icon fetch failed", { symbol: key, reason: "no candidate succeeded" });
      this.markIconAsFailed(key);
    } catch (error) {
      logger.debug("icons", "icon fetch failed", { symbol: key, error: error instanceof Error ? error.message : "requete impossible" });
      this.markIconAsFailed(key);
    }
    return this.getCached(key);
  }

  markIconAsFailed(symbol: string) {
    const key = normalizeSymbol(symbol);
    if (!key) return;
    db.prepare(
      `INSERT INTO asset_icons (symbol, source, fetch_status, last_attempt_at)
       VALUES (?, 'auto', 'failed', CURRENT_TIMESTAMP)
       ON CONFLICT(symbol) DO UPDATE SET fetch_status = 'failed', last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
    ).run(key);
  }

  hasRecentFailure(symbol: string) {
    const icon = this.getCached(symbol);
    if (icon?.fetchStatus !== "failed" || !icon.lastAttemptAt) return false;
    return Date.now() - new Date(icon.lastAttemptAt).getTime() < failureCooldownMs;
  }

  hasRecentPending(symbol: string) {
    const icon = this.getCached(symbol);
    if (icon?.fetchStatus !== "pending" || !icon.lastAttemptAt) return false;
    return Date.now() - new Date(icon.lastAttemptAt).getTime() < maxAutoFetchMs * 2;
  }

  resetIcon(symbol: string) {
    const key = normalizeSymbol(symbol);
    const icon = this.getCached(key);
    if (icon?.filePath && fs.existsSync(icon.filePath)) fs.unlinkSync(icon.filePath);
    db.prepare(
      `INSERT INTO asset_icons (symbol, source, fetch_status, file_path, mime_type, size, last_attempt_at)
       VALUES (?, 'auto', 'pending', NULL, NULL, NULL, NULL)
       ON CONFLICT(symbol) DO UPDATE SET
        file_path = NULL,
        mime_type = NULL,
        size = NULL,
        source = 'auto',
        fetch_status = 'pending',
        last_attempt_at = NULL,
        updated_at = CURRENT_TIMESTAMP`
    ).run(key);
    logger.debug("icons", "icon deleted", { symbol: key });
  }

  placeholder(symbol: string) {
    return placeholderSvg(symbol);
  }

  isAllowedImageMime(mimeType: string) {
    return ["image/png", "image/jpeg", "image/jpg"].includes(mimeType.toLowerCase());
  }

  listKnownAssets() {
    return db
      .prepare(
        `SELECT symbol, name FROM positions
         UNION
         SELECT symbol, name FROM watchlist
         ORDER BY symbol ASC`
      )
      .all()
      .map((row: any) => {
        const symbol = String(row.symbol);
        return { symbol, name: String(row.name), icon: this.getCached(symbol) };
      });
  }

  private getAssetMetadata(symbol: string) {
    const key = normalizeSymbol(symbol);
    const known = db
      .prepare(
        `SELECT symbol, name FROM positions WHERE symbol = ?
         UNION
         SELECT symbol, name FROM watchlist WHERE symbol = ?
         LIMIT 1`
      )
      .get(key, key) as { name?: string } | undefined;
    const quote = readCachedQuote(key);
    return {
      name: quote?.name ?? known?.name,
      quoteType: quote?.quoteType,
      website: quote?.website
    };
  }

  private isEtf(symbol: string) {
    return isEtfCandidate(this.getAssetMetadata(symbol));
  }

  private logLogoDevConfig() {
    if (logoDevConfigLogged) return;
    logoDevConfigLogged = true;
    const key = config.logoDevApiKey;
    const keyKind = key?.startsWith("pk_") ? "publishable" : key?.startsWith("sk_") ? "secret" : key ? "format inconnu" : "absente";
    logger.debug("icons", "logo.dev config", { active: Boolean(key), keyKind });
    if (key?.startsWith("sk_")) {
      logger.warn("icons", "logo.dev expects a publishable key for image fetches", { keyKind });
    }
  }

  private markIconPending(symbol: string) {
    db.prepare(
      `INSERT INTO asset_icons (symbol, source, fetch_status, last_attempt_at)
       VALUES (?, 'auto', 'pending', CURRENT_TIMESTAMP)
       ON CONFLICT(symbol) DO UPDATE SET fetch_status = 'pending', last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`
    ).run(symbol);
  }

  private async getWebsiteFromYahooAssetProfile(symbol: string): Promise<string | undefined> {
    const key = symbol.toUpperCase();
    const summary = (await dedupeInFlight(`icon:${key}`, () =>
      yahooClient.quoteSummary(key, { modules: ["assetProfile"] } as any)
    )) as any;
    return normalizeWebsite(summary?.assetProfile?.website);
  }

  private buildLogoDevCandidates(symbol: string, name?: string): LogoCandidate[] {
    if (!config.logoDevApiKey) return [];
    const token = encodeURIComponent(config.logoDevApiKey);
    const params = `token=${token}&theme=dark&size=128&format=png&fallback=404`;
    const candidates: LogoCandidate[] = [
      {
        url: `https://img.logo.dev/ticker/${encodeURIComponent(symbol)}?${params}`,
        source: "logo.dev ticker",
        label: symbol
      }
    ];
    if (name) {
      candidates.push({
        url: `https://img.logo.dev/name/${encodeURIComponent(name)}?${params}`,
        source: "logo.dev name",
        label: name
      });
    }
    return candidates;
  }

  private buildLogoDevDomainCandidates(website?: string): LogoCandidate[] {
    if (!config.logoDevApiKey) return [];
    const token = encodeURIComponent(config.logoDevApiKey);
    const params = `token=${token}&size=128&format=png&fallback=404`;
    const domain = domainFromWebsite(website);
    return domain ? [{ url: `https://img.logo.dev/${encodeURIComponent(domain)}?${params}`, source: "logo.dev website", label: domain }] : [];
  }

  private async fetchFirstAllowedImage(symbol: string, candidates: LogoCandidate[]) {
    for (const candidate of candidates) {
      logger.debug("icons", "icon fetch attempt", { symbol, source: candidate.source, label: candidate.label });
      const response = await fetchWithTimeout(candidate.url).catch((error) => {
        logger.debug("icons", "icon fetch failed", { symbol, source: candidate.source, label: candidate.label, error: error instanceof Error ? error.message : "requete impossible" });
        return undefined;
      });
      if (!response) continue;
      if (!response.ok) {
        logger.debug("icons", "icon fetch failed", { symbol, source: candidate.source, label: candidate.label, status: response.status, authHint: response.status === 401 });
        continue;
      }
      const mimeType = response.headers.get("content-type")?.split(";")[0]?.toLowerCase() ?? "image/png";
      if (!this.isAllowedImageMime(mimeType)) {
        logger.debug("icons", "icon fetch failed", { symbol, source: candidate.source, label: candidate.label, mimeType, reason: "unsupported mime type" });
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length <= 0) {
        logger.debug("icons", "icon fetch failed", { symbol, source: candidate.source, label: candidate.label, reason: "empty image" });
        continue;
      }
      if (buffer.length > 1024 * 1024) {
        logger.debug("icons", "icon fetch failed", { symbol, source: candidate.source, label: candidate.label, size: buffer.length, reason: "image too large" });
        continue;
      }
      logger.debug("icons", "icon fetch ok", { symbol, source: candidate.source, label: candidate.label, mimeType, size: buffer.length });
      return { buffer, mimeType };
    }
    return undefined;
  }

  private buildFaviconCandidates(website?: string): LogoCandidate[] {
    if (!website) return [];
    const domain = new URL(website).hostname;
    return [
      { url: `${website}/favicon.ico`, source: "favicon", label: domain },
      { url: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`, source: "favicon", label: `google:${domain}` }
    ];
  }
}

export const iconService = new IconService();
