import type { CurrencyCode } from "../market.js";
import type { PeaEligibilityResult } from "../assets.js";

export interface CreatePositionInput {
  symbol: string;
  name?: string;
  quantity: number;
  averageBuyPrice: number;
  currency: CurrencyCode;
}

export interface UpdatePositionInput {
  quantity: number;
  averageBuyPrice: number;
  currency: CurrencyCode;
  notes?: string;
}

export interface BoursoramaImportRow {
  line: number;
  name: string;
  isin: string;
  quantity: number;
  buyingPrice: number;
  lastPrice: number;
  intradayVariation: number;
  amount: number;
  amountVariation: number;
  variation: number;
  symbol: string | null;
  peaEligibility?: PeaEligibilityResult;
  detectedAsset?: {
    symbol: string;
    name: string;
    confidenceScore: number;
  };
  needsReview: boolean;
  errors: string[];
  existingPositionId?: number;
  action?: "replace" | "merge" | "ignore";
}

export interface BoursoramaUpdateRow extends BoursoramaImportRow {
  currentQuantity?: number;
  csvQuantity: number;
  quantityDiff: number;
  currentAverageBuyPrice?: number;
  csvAverageBuyPrice: number;
  proposedAction: "add" | "update" | "reduce" | "delete" | "unchanged" | "ignore";
  positionId?: number;
}

export type PortfolioTransactionSource = "csv" | "pdf_avis_opere" | "manual";
export type PortfolioTransactionType = "buy" | "sell" | "dividend" | "fee" | "unknown";

export interface PortfolioTransaction {
  id: string;
  assetId?: string;
  source: PortfolioTransactionSource;
  sourceFileName?: string;
  dateExecution?: string;
  valueDate?: string;
  assetName?: string;
  isin?: string;
  ticker?: string;
  type: PortfolioTransactionType;
  quantity: number;
  executedPrice?: number;
  totalFees?: number;
  currency: CurrencyCode;
  rawTextSnippet?: string;
  createdAt: string;
}

export interface EditablePortfolioTransaction extends PortfolioTransaction {
  positionId: number;
  price: number;
  tradedAt: string;
}

export interface ParsedAvisOperation {
  id: string;
  dateExecution?: string;
  nomValeur?: string;
  isin?: string;
  ticker?: string;
  quantite?: number | string;
  sensOperation: "achat" | "vente" | "inconnu";
  coursExecute?: number | string;
  montantTotalFrais?: number | string;
  devise: CurrencyCode;
  sourceFileName?: string;
  rawTextSnippet?: string;
  errors?: string[];
  warnings: string[];
  potentialDuplicate?: boolean;
  resolvedAsset?: {
    symbol: string;
    name: string;
    confidenceScore: number;
  };
  selectedSymbol?: string;
  selectedAssetName?: string;
  action?: "import" | "ignore";
}
