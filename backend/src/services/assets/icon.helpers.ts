import fs from "node:fs";
import path from "node:path";
import { config } from "../../config.js";
import { assetIconRepository, type AssetIconRow } from "../../repositories/assets/asset-icon.repository.js";

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

export const iconsDir = path.resolve(path.dirname(config.sqlitePath), "icons");
export const maxAutoFetchMs = 3000;
export const failureCooldownMs = 24 * 60 * 60 * 1000;
const etfNamePattern = /\b(ETF|UCITS|MSCI|S&P|STOXX|ISHARES|AMUNDI|LYXOR|VANGUARD|XTRACKERS)\b/i;
export type LogoCandidate = {
  url: string;
  source: "logo.dev ticker" | "logo.dev name" | "logo.dev website" | "favicon";
  label: string;
};

fs.mkdirSync(iconsDir, { recursive: true });

export function normalizeSymbol(symbol: string) {
  return String(symbol ?? "").trim().toUpperCase().replace(/[^A-Z0-9._-]/g, "");
}

export function mapIcon(row: AssetIconRow): AssetIcon {
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

export function normalizeWebsite(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.origin;
  } catch {
    return undefined;
  }
}

export function domainFromWebsite(value?: string) {
  const website = normalizeWebsite(value);
  if (!website) return undefined;
  return new URL(website).hostname.replace(/^www\./i, "");
}

export function readCachedQuote(symbol: string): { name?: string; quoteType?: string; website?: string } | undefined {
  const row = assetIconRepository.readCachedQuote(normalizeSymbol(symbol));
  if (!row?.payload) return undefined;
  try {
    const payload = JSON.parse(String(row.payload)) as { name?: string; quoteType?: string; website?: string };
    return payload;
  } catch {
    return undefined;
  }
}

export function isEtfCandidate(input: { name?: string; quoteType?: string }) {
  return String(input.quoteType ?? "").toUpperCase() === "ETF" || etfNamePattern.test(String(input.name ?? ""));
}

export function placeholderSvg(symbol: string) {
  const text = normalizeSymbol(symbol).slice(0, 3) || "?";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" rx="18" fill="#071014"/><text x="64" y="76" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#38bdf8">${text}</text></svg>`
  );
}

export async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), maxAutoFetchMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { "user-agent": "PEA Portfolio" } });
  } finally {
    clearTimeout(timeout);
  }
}

