import { z } from "zod";
import { isValidIsin } from "../../../utils/isin.js";
import stocks from "../../../data/boursedirect_pea_action.json" with { type: "json" };
import etfs from "../../../data/boursedirect_pea_etf.json" with { type: "json" };

const instrumentSchema = z.object({
  name: z.string().trim().min(1),
  ticker: z.string().trim().min(1),
  isin: z.string().trim().refine(isValidIsin, "ISIN invalide").optional(),
  market: z.object({ mic: z.string(), name: z.string().nullable() }),
  currency: z.object({ code: z.string() }),
  logo: z.string().optional()
});
const catalogSchema = z.object({ count: z.number().int().nonnegative(), instruments: z.array(instrumentSchema) })
  .refine((data) => data.count === data.instruments.length, "Le compteur du catalogue est incohérent");

// Only unambiguous Yahoo venues: never use a bare broker ticker as a US symbol.
const suffixByMic: Record<string, string> = {
  XPAR: ".PA", ALXP: ".PA", XMLI: ".PA", XAMS: ".AS", XAMC: ".AS",
  XBRU: ".BR", ALXB: ".BR", MLXB: ".BR", XETR: ".DE", XFRA: ".F",
  XMAD: ".MC", XLIS: ".LS", ALXL: ".LS", XSWX: ".SW", XLON: ".L",
  AIMX: ".L", ETFP: ".MI", XOSL: ".OL"
};

export interface PeaCatalogAsset {
  symbol: string;
  ticker: string;
  isin: string;
  name: string;
  exchange: string;
  currency: string;
  quoteType: "EQUITY" | "ETF";
  logo: string | undefined;
}

/** Restrict fallback downloads to the broker's static image directory. */
export function safeBrokerLogo(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.origin === "https://www.boursedirect.fr" && !url.username && !url.password
      && url.pathname.startsWith("/assets/images/logo/companies/") ? url.href : undefined;
  } catch { return undefined; }
}

export function parsePeaCatalog(data: unknown, quoteType: PeaCatalogAsset["quoteType"]): PeaCatalogAsset[] {
  return catalogSchema.parse(data).instruments.flatMap((item) => {
    const suffix = Object.hasOwn(suffixByMic, item.market.mic) ? suffixByMic[item.market.mic] : undefined;
    // Missing ISIN cannot identify a security reliably; unsupported venues stay out of local search.
    if (!suffix || !item.isin || !/^[A-Z0-9][A-Z0-9.-]*$/i.test(item.ticker)) return [];
    // Bourse Direct prefixes Frankfurt mnemonics with F (F2GB -> 2GB.F).
    const ticker = item.ticker.toUpperCase();
    const yahooTicker = item.market.mic === "XFRA" && ticker.startsWith("F") ? ticker.slice(1) : ticker;
    if (!yahooTicker) return [];
    return [{ symbol: yahooTicker + suffix, ticker,
      isin: item.isin, name: item.name, exchange: item.market.name ?? item.market.mic,
      currency: item.currency.code, quoteType, logo: safeBrokerLogo(item.logo) }];
  });
}

const entries = [...parsePeaCatalog(stocks, "EQUITY"), ...parsePeaCatalog(etfs, "ETF")];
export const peaCatalog = [...new Map(entries.map((item) => [item.symbol, item])).values()];
const bySymbol = new Map(peaCatalog.map((item) => [item.symbol, item]));
// A logo can come from an unsupported venue, but identity must still match by ISIN.
const logoByIsin = new Map([stocks, etfs].flatMap((data) =>
  catalogSchema.parse(data).instruments.flatMap((item) => {
    const logo = safeBrokerLogo(item.logo);
    return item.isin && logo ? [[item.isin, logo] as const] : [];
  })
));
export function findPeaAsset(symbol: string) { return bySymbol.get(symbol.trim().toUpperCase()); }
export function findPeaLogo(symbol: string) {
  const asset = findPeaAsset(symbol);
  return asset?.logo ?? (asset ? logoByIsin.get(asset.isin) : undefined);
}
