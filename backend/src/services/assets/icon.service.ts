import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { assetIconRepository, type KnownAssetRow } from "../../repositories/assets/asset-icon.repository.js";
import { detectSupportedImageMime, isSupportedImageMime } from "../../utils/image-signature.js";
import { currentUserId } from "../auth/user-context.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { logger } from "../shared/logger.service.js";

import { domainFromWebsite, extensionForMime, failureCooldownMs, fetchWithTimeout, iconsDir, isEtfCandidate, mapIcon, maxAutoFetchMs, normalizeSymbol, normalizeWebsite, placeholderSvg, readCachedQuote, type AssetIcon, type LogoCandidate } from "./icon.helpers.js";
export type { AssetIcon } from "./icon.helpers.js";

let logoDevConfigLogged = false;
export class IconService {
  iconsDir = iconsDir;

  getCached(symbol: string): AssetIcon | undefined {
    const key = normalizeSymbol(symbol);
    if (!key) return undefined;
    const row = assetIconRepository.find(key);
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
    const cleanMime = detectSupportedImageMime(buffer);
    if (!cleanMime) throw new Error("Image invalide.");
    const extension = extensionForMime(cleanMime);
    const filePath = path.join(iconsDir, `${key}.${extension}`);

    for (const candidate of ["png", "jpg"]) {
      const candidatePath = path.join(iconsDir, `${key}.${candidate}`);
      if (candidatePath !== filePath && fs.existsSync(candidatePath)) fs.unlinkSync(candidatePath);
    }

    fs.writeFileSync(filePath, buffer);
    assetIconRepository.saveSuccess({ symbol: key, filePath, mimeType: cleanMime, size: buffer.length, source });
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
    assetIconRepository.markFailed(key);
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
    assetIconRepository.reset(key);
    logger.debug("icons", "icon deleted", { symbol: key });
  }

  placeholder(symbol: string) {
    return placeholderSvg(symbol);
  }

  isAllowedImageMime(mimeType: string) {
    return isSupportedImageMime(mimeType);
  }

  listKnownAssets() {
    return assetIconRepository.listKnownAssets(currentUserId())
      .map((row: KnownAssetRow) => {
        const symbol = String(row.symbol);
        return { symbol, name: String(row.name), icon: this.getCached(symbol) };
      });
  }

  private getAssetMetadata(symbol: string) {
    const key = normalizeSymbol(symbol);
    const known = assetIconRepository.findKnownAsset(key, currentUserId());
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
    assetIconRepository.markPending(symbol);
  }

  private async getWebsiteFromYahooAssetProfile(symbol: string): Promise<string | undefined> {
    const key = symbol.toUpperCase();
    const profile = await marketDataGateway.fetchFreshAssetProfile(key);
    return normalizeWebsite(profile.website ?? undefined);
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
      const detectedMimeType = detectSupportedImageMime(buffer);
      if (!detectedMimeType) {
        logger.debug("icons", "icon fetch failed", { symbol, source: candidate.source, label: candidate.label, reason: "invalid image signature" });
        continue;
      }
      if (buffer.length <= 0) {
        logger.debug("icons", "icon fetch failed", { symbol, source: candidate.source, label: candidate.label, reason: "empty image" });
        continue;
      }
      if (buffer.length > 1024 * 1024) {
        logger.debug("icons", "icon fetch failed", { symbol, source: candidate.source, label: candidate.label, size: buffer.length, reason: "image too large" });
        continue;
      }
      logger.debug("icons", "icon fetch ok", { symbol, source: candidate.source, label: candidate.label, mimeType: detectedMimeType, size: buffer.length });
      return { buffer, mimeType: detectedMimeType };
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
