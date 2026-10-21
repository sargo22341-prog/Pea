import type { CurrencyCode } from "../market.js";
import type { PeaEligibilityResult } from "../assets.js";
import type { CashStatementCheck } from "../cash/cash-statements.js";

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
  peaEligibility?: PeaEligibilityResult | undefined;
  detectedAsset?: {
    symbol: string;
    name: string;
    confidenceScore: number;
  } | undefined;
  needsReview: boolean;
  errors: string[];
  existingPositionId?: number | undefined;
  action?: "replace" | "merge" | "ignore" | undefined;
}

export interface BoursoramaUpdateRow extends BoursoramaImportRow {
  currentQuantity?: number | undefined;
  csvQuantity: number;
  quantityDiff: number;
  currentAverageBuyPrice?: number | undefined;
  csvAverageBuyPrice: number;
  proposedAction: "add" | "update" | "reduce" | "delete" | "unchanged" | "ignore";
  positionId?: number | undefined;
}

export type PortfolioTransactionSource = "csv" | "pdf_avis_opere" | "manual";
export type PortfolioTransactionType = "buy" | "sell" | "dividend" | "fee" | "unknown";

export interface PortfolioTransaction {
  id: string;
  assetId?: string;
  source: PortfolioTransactionSource;
  sourceFileName?: string | undefined;
  dateExecution?: string;
  valueDate?: string;
  assetName?: string | undefined;
  isin?: string | undefined;
  ticker?: string | undefined;
  type: PortfolioTransactionType;
  quantity: number;
  executedPrice?: number;
  totalFees?: number | undefined;
  currency: CurrencyCode;
  rawTextSnippet?: string | undefined;
  createdAt: string;
}

export interface EditablePortfolioTransaction extends PortfolioTransaction {
  positionId: number;
  price: number;
  tradedAt: string;
  /** Facteur des divisions d'actions appliquées à cette transaction (quantité × facteur, prix ÷ facteur). */
  splitFactor?: number | undefined;
  /** Contrôle par les relevés espèces : vérifié, à vérifier ou non retrouvé. */
  cashCheck?: CashStatementCheck | undefined;
}

/** Code d'erreur (409) d'une opération identique à une opération déjà enregistrée sur la position. */
export const DUPLICATE_TRANSACTION_CODE = "DUPLICATE_TRANSACTION";

export interface DuplicateTransactionDetails {
  code: typeof DUPLICATE_TRANSACTION_CODE;
  /** Opération déjà enregistrée reconnue comme identique. */
  transactionId: number;
}

/** Résultat de la confirmation d'un import d'opérations (CSV ou avis d'opéré). */
export interface TradeImportResult {
  imported: string[];
  skipped: string[];
  /** Avis d'opéré dont l'opération existait déjà : sa référence d'ordre lui a été ajoutée, rien n'a été créé. */
  linked?: string[] | undefined;
  errors: { line: number; message: string }[];
  jobId?: string | undefined;
  isPreparing?: boolean | undefined;
}

export interface ParsedAvisOperation {
  id: string;
  dateExecution?: string | undefined;
  nomValeur?: string | undefined;
  isin?: string | undefined;
  ticker?: string | undefined;
  quantite?: number | string | undefined;
  sensOperation: "achat" | "vente" | "inconnu";
  coursExecute?: number | string | undefined;
  montantTotalFrais?: number | string | undefined;
  devise: CurrencyCode;
  sourceFileName?: string | undefined;
  /** Référence de l'ordre imprimée sur l'avis : identifie un import déjà réalisé. */
  reference?: string | undefined;
  rawTextSnippet?: string | undefined;
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
  /** L'utilisateur confirme vouloir enregistrer une opération reconnue comme doublon. */
  confirmDuplicate?: boolean | undefined;
}
