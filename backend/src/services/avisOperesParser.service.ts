import type { ParsedAvisOperation } from "@pea/shared";
import { z } from "zod";

const moneyLabels = {
  grossAmount: [
    "Montant brut",
    "Montant transaction brut",
    "Montant transaction brut Intérêts",
    "Montant transaction",
    "total brut Courtages"
  ],
  commission: ["Commission"],
  fees: ["Frais divers", "Frais"],
  totalFees: ["Montant total des frais"],
  netAmount: ["Montant net au débit de votre compte", "Montant net au credit de votre compte", "Montant transaction net"]
};

export const parsedAvisOperationSchema = z.object({
  id: z.string(),
  dateExecution: z.string().optional(),
  nomValeur: z.string().optional(),
  isin: z.string().optional(),
  ticker: z.string().optional(),
  quantite: z.number().positive().optional(),
  sensOperation: z.enum(["achat", "vente", "inconnu"]),
  coursExecute: z.number().nonnegative().optional(),
  montantBrut: z.number().nonnegative().optional(),
  commission: z.number().nonnegative().optional(),
  frais: z.number().nonnegative().optional(),
  montantTotalFrais: z.number().nonnegative().optional(),
  montantNet: z.number().nonnegative().optional(),
  devise: z.string().min(3).default("EUR"),
  sourceFileName: z.string().optional(),
  rawTextSnippet: z.string().optional(),
  warnings: z.array(z.string())
});

export function normalizeText(text: string) {
  return text
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withoutAccents(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function normalizeFrenchNumber(value: string): number | undefined {
  const cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\- ]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : undefined;
}

export function parseFrenchMoney(value?: string): number | undefined {
  if (!value) return undefined;
  return normalizeFrenchNumber(value);
}

export function parseFrenchDate(date?: string, time?: string): string | undefined {
  if (!date) return undefined;
  const match = /(\d{2})\/(\d{2})\/(\d{4})/.exec(date);
  if (!match) return undefined;
  const [, day, month, year] = match;
  const safeTime = /^\d{2}:\d{2}:\d{2}$/.test(time ?? "") ? time : "00:00:00";
  return `${year}-${month}-${day}T${safeTime}`;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelPattern(label: string) {
  return escapeRegex(withoutAccents(label)).replace(/\\ /g, "\\s+");
}

export function extractFieldByLabels(text: string, labels: string[]): string | undefined {
  const normalized = withoutAccents(text);
  for (const label of labels) {
    const regex = new RegExp(`${labelPattern(label)}\\s*[:\\n ]+([\\d\\s.,]+)\\s*([A-Z]{3}|€)?`, "i");
    const match = regex.exec(normalized);
    if (match?.[1]) return `${match[1]} ${match[2] ?? ""}`.trim();
  }
  return undefined;
}

export function detectOperationType(text: string): ParsedAvisOperation["sensOperation"] {
  const normalized = withoutAccents(text).toLowerCase();
  if (/\bvente\b/.test(normalized)) return "vente";
  if (/\bachat\b/.test(normalized)) return "achat";
  return "inconnu";
}

export function extractIsin(text: string) {
  return /\b([A-Z]{2}[A-Z0-9]{9}\d)\b/.exec(text)?.[1];
}

export function extractExecutedPrice(text: string) {
  const value = /Cours ex[ée]cut[ée]\s*:\s*([\d\s.,]+)\s*([A-Z]{3}|€)?/i.exec(text)?.[1];
  return normalizeFrenchNumber(value ?? "");
}

export function extractQuantity(text: string) {
  const match = /(?:\d{2}:\d{2}:\d{2}\s*\n\s*)?(\d+(?:[,.]\d+)?)\s+([^\n]+?)\s+R[ée]f[ée]rence\s*:/i.exec(text);
  return {
    quantity: normalizeFrenchNumber(match?.[1] ?? ""),
    assetName: match?.[2]?.replace(/\s+/g, " ").trim()
  };
}

export function extractFees(text: string) {
  const oldTable = amountsAfterHeader(text, /Montant brut\s+Commission\s+Frais/i);
  const modernFeesTable = amountsAfterHeader(text, /Commission\s+Frais divers\s+Montant total des frais/i);
  const commission = modernFeesTable[0] ?? oldTable[1] ?? parseFrenchMoney(extractFieldByLabels(text, moneyLabels.commission));
  const fees = modernFeesTable[1] ?? oldTable[2] ?? parseFrenchMoney(extractFieldByLabels(text, moneyLabels.fees));
  const totalFees = modernFeesTable[2] ?? parseFrenchMoney(extractFieldByLabels(text, moneyLabels.totalFees));
  return { commission, fees, totalFees };
}

function extractDateExecution(text: string) {
  const headerMatch = /(\d{2}\/\d{2}\/\d{4})\s*\n\s*(\d{2}:\d{2}:\d{2})/.exec(text);
  if (headerMatch) return parseFrenchDate(headerMatch[1], headerMatch[2]);
  const fallback = /le\s+(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  return parseFrenchDate(fallback?.[1]);
}

function extractCurrency(text: string) {
  const currency = /\b(EUR|USD|GBP|CHF)\b/.exec(text)?.[1];
  return currency ?? (text.includes("€") ? "EUR" : "EUR");
}

function extractGrossAmount(text: string) {
  const oldTable = amountsAfterHeader(text, /Montant brut\s+Commission\s+Frais/i);
  if (oldTable[0] !== undefined) return oldTable[0];
  const modernTransactionTable = amountsAfterHeader(text, /Montant transaction brut/i);
  if (modernTransactionTable[0] !== undefined) return modernTransactionTable[0];
  if (/Montant transaction brut/i.test(text)) {
    const start = text.search(/Montant transaction brut/i);
    const end = text.search(/Commission\s+Frais divers/i);
    const transactionBlock = text.slice(start, end > start ? end : undefined);
    const amounts = [...transactionBlock.matchAll(/([\d\s]+,\d{2})\s*(EUR|€)/g)].map((match) => parseFrenchMoney(match[1]));
    return amounts.find((amount) => amount !== undefined && amount > 0);
  }
  return parseFrenchMoney(extractFieldByLabels(text, moneyLabels.grossAmount));
}

function extractNetAmount(text: string) {
  const oldTable = amountsAfterHeader(text, /Montant brut\s+Commission\s+Frais/i);
  if (oldTable[3] !== undefined) return oldTable[3];
  const debit = /Montant net au d[ée]bit de votre compte\s*\n?\s*([\d\s.,]+)\s*([A-Z]{3}|€)?/i.exec(text);
  if (debit?.[1]) return parseFrenchMoney(debit[1]);
  return parseFrenchMoney(extractFieldByLabels(text, moneyLabels.netAmount));
}

function amountsAfterHeader(text: string, header: RegExp) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => header.test(line));
  if (headerIndex === -1) return [];
  const valuesLine = lines.slice(headerIndex + 1, headerIndex + 4).join(" ");
  return [...valuesLine.matchAll(/([\d\s]+,\d{2})\s*(?:EUR|€)/g)]
    .map((match) => parseFrenchMoney(match[1]))
    .filter((value): value is number => value !== undefined);
}

function rawSnippet(text: string) {
  const start = Math.max(0, text.search(/ACHAT|VENTE|Date et heure/i));
  return text.slice(start, start + 900).trim();
}

function buildWarnings(operation: Omit<ParsedAvisOperation, "warnings">) {
  const warnings: string[] = [];
  if (!operation.dateExecution) warnings.push("Date d'execution non detectee.");
  if (!operation.quantite) warnings.push("Quantite non detectee.");
  if (!operation.nomValeur) warnings.push("Nom de valeur non detecte.");
  if (operation.sensOperation === "inconnu") warnings.push("Sens achat/vente incertain.");
  if (operation.coursExecute === undefined) warnings.push("Cours execute non detecte.");
  if (operation.montantNet === undefined) warnings.push("Montant net non detecte.");
  return warnings;
}

export function parseAvisOperesText(text: string, fileName?: string): ParsedAvisOperation[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const { quantity, assetName } = extractQuantity(normalized);
  const fees = extractFees(normalized);
  const operation = {
    id: `${fileName ?? "avis"}-${extractDateExecution(normalized) ?? Date.now()}`,
    dateExecution: extractDateExecution(normalized),
    nomValeur: assetName,
    isin: extractIsin(normalized),
    ticker: undefined,
    quantite: quantity,
    sensOperation: detectOperationType(normalized),
    coursExecute: extractExecutedPrice(normalized),
    montantBrut: extractGrossAmount(normalized),
    commission: fees.commission,
    frais: fees.fees,
    montantTotalFrais: fees.totalFees ?? sumFees(fees.commission, fees.fees),
    montantNet: extractNetAmount(normalized),
    devise: extractCurrency(normalized),
    sourceFileName: fileName,
    rawTextSnippet: rawSnippet(normalized)
  } satisfies Omit<ParsedAvisOperation, "warnings">;

  return [parsedAvisOperationSchema.parse({ ...operation, warnings: buildWarnings(operation) })];
}

function sumFees(...values: Array<number | undefined>) {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length ? present.reduce((sum, value) => sum + value, 0) : undefined;
}
