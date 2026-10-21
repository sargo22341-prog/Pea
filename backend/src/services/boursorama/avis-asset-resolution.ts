import type { ParsedAvisOperation, SearchResult } from "@pea/shared";
import { dividendVerificationRepository } from "../../repositories/cash/dividend-verification.repository.js";
import { portfolioRepository } from "../../repositories/portfolio/portfolio.repository.js";
import { currentUserId } from "../auth/user-context.js";
import { evaluatePeaEligibility, sortAssetsForPea } from "../assets/peaEligibility.js";
import { marketDataGateway } from "../market/data/market-data-gateway.service.js";
import { logger } from "../shared/logger.service.js";

/**
 * Tente d’associer automatiquement une opération à un actif connu.
 *
 * La résolution se fait d’abord via les positions existantes,
 * puis via une recherche Yahoo Finance sur l’ISIN, le ticker ou le nom de valeur.
 */
export async function resolveAssetFromOperation(
  operation: ParsedAvisOperation
): Promise<ParsedAvisOperation> {
  const existing = findExistingPosition(operation);

  if (existing) {
    return {
      ...operation,
      resolvedAsset: {
        symbol: existing.symbol,
        name: existing.name,
        confidenceScore: existing.score
      },
      selectedSymbol: existing.symbol,
      selectedAssetName: existing.name
    };
  }

  const queries = [operation.isin, operation.ticker, operation.nomValeur].filter(
    (value): value is string => Boolean(value?.trim())
  );

  for (const query of queries) {
    try {
      const result = await marketDataGateway.search(query);
      const best = bestCandidate(result.data);

      if (best) {
        return {
          ...operation,
          resolvedAsset: {
            symbol: best.symbol,
            name: best.name,
            confidenceScore: best.score
          },
          selectedSymbol: best.symbol,
          selectedAssetName: best.name
        };
      }
    } catch (error) {
      // La prévisualisation reste utilisable avec une résolution manuelle.
      logger.debug("import", "asset resolution failed", { query, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    ...operation,
    warnings: [...operation.warnings, "Aucun actif resolu automatiquement."]
  };
}

/** Score d'une position reconnue par l'ISIN de l'avis : critère objectif, prioritaire sur le nom. */
const isinMatchScore = 0.99;

/**
 * Recherche une position existante pouvant correspondre à l’opération parsée : d'abord par ISIN
 * (saisi sur la position ou lu sur ses avis déjà importés), puis par ticker ou nom.
 */
function findExistingPosition(operation: ParsedAvisOperation) {
  const isin = operation.isin?.trim().toUpperCase();
  const byIsin = isin ? dividendVerificationRepository.listPositions(currentUserId()).find((row) => row.isin?.toUpperCase() === isin) : undefined;
  if (byIsin) return { symbol: byIsin.symbol, name: byIsin.name, score: isinMatchScore };

  const candidates = [operation.ticker, operation.nomValeur, operation.isin]
    .filter(Boolean)
    .map((value) => String(value).toUpperCase());

  const rows = portfolioRepository.listPositions(currentUserId());

  for (const row of rows) {
    const symbol = row.symbol.toUpperCase();
    const name = row.name.toUpperCase();

    if (
      candidates.some(
        (candidate) =>
          symbol === candidate ||
          name.includes(candidate) ||
          candidate.includes(name)
      )
    ) {
      return {
        symbol: row.symbol,
        name: row.name,
        score: symbol === operation.ticker?.toUpperCase() ? 0.98 : 0.75
      };
    }
  }

  return undefined;
}

/**
 * Sélectionne le meilleur résultat de recherche en privilégiant les actifs compatibles PEA.
 */
function bestCandidate(items: SearchResult[]) {
  const sorted = sortAssetsForPea(
    items.map((item) => ({
      ...item,
      peaEligibility: item.peaEligibility ?? evaluatePeaEligibility(item)
    }))
  );

  const best = sorted[0];
  if (!best) return undefined;

  const eligible = ["eligible", "likely_eligible"].includes(
    best.peaEligibility.status
  );

  return {
    symbol: best.symbol.toUpperCase(),
    name: best.name,
    score: eligible ? 0.82 : 0.55
  };
}
