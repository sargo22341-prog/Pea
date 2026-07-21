import { z } from "zod";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";

function normalizeNumericInput(value: unknown) {
  if (typeof value === "string") return value.trim().replace(",", ".");
  return value;
}

function numberSchema(label: string) {
  return z.number({ error: `${label} doit etre un nombre.` }).finite(`${label} doit etre un nombre.`);
}

function requiredNumber(schema: z.ZodNumber) {
  return z.preprocess(
    (value) => {
      const normalized = normalizeNumericInput(value);
      if (normalized === "" || normalized === null || normalized === undefined) return Number.NaN;
      return Number(normalized);
    },
    schema
  );
}

function optionalNumber(schema: z.ZodOptional<z.ZodNumber>) {
  return z.preprocess(
    (value) => {
      const normalized = normalizeNumericInput(value);
      if (normalized === "" || normalized === null || normalized === undefined) return undefined;
      return Number(normalized);
    },
    schema
  );
}

export const confirmOperationSchema = z.object({
  sourceFileName: z.string().optional(),
  dateExecution: z.string().optional(),
  nomValeur: z.string().optional(),
  isin: z.string().optional(),
  ticker: z.string().optional(),
  quantite: requiredNumber(numberSchema("Quantite").positive("Quantite doit etre superieure a 0.")),
  sensOperation: z.enum(["achat", "vente", "inconnu"]),
  coursExecute: requiredNumber(numberSchema("Cours").nonnegative("Cours doit etre positif ou nul.")),
  montantTotalFrais: optionalNumber(numberSchema("Total frais").nonnegative("Total frais doit etre positif ou nul.").optional()),
  devise: z.string().default("EUR"),
  rawTextSnippet: z.string().optional(),
  selectedSymbol: z.string().optional(),
  selectedAssetName: z.string().optional(),
  action: z.enum(["import", "ignore"]).optional()
});

export function formatValidationError(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join(" ");
}

export async function assertYahooSymbolExists(symbol: string) {
  const key = symbol.trim().toUpperCase();
  const result = await marketDataGateway.readQuoteWithCache(key);
  const foundSymbol = result.data.symbol?.toUpperCase();
  if (!foundSymbol || foundSymbol !== key) {
    throw new Error(`Ticker Yahoo introuvable: ${key}.`);
  }
}
