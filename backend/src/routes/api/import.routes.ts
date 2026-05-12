// Rôle du fichier : déclarer les routes d'import Boursorama et avis d'opérés.

import express from "express";
import { z } from "zod";
import { confirmAvisOperesImport, previewAvisOperesImport } from "../../services/boursorama/importAvisOperes.service.js";
import { confirmBoursoramaImport, confirmBoursoramaUpdate, previewBoursoramaImport, previewBoursoramaUpdate } from "../../services/boursorama/importBoursorama.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { dataConstructionQueue } from "../../services/market/construction/data-construction-queue.service.js";
import { asyncRoute } from "../shared/async-route.js";
import { parseMultipartFiles } from "../shared/multipart.js";

export const importRouter = express.Router();

// Schéma d'une ligne Boursorama à importer (preview → confirm)
const schemaBoursoramaLigneConfirmation = z.object({
  line: z.coerce.number().int().nonnegative(),
  name: z.string().trim().min(1),
  isin: z.string().trim(),
  quantity: z.coerce.number().nonnegative(),
  buyingPrice: z.coerce.number().nonnegative(),
  lastPrice: z.coerce.number(),
  intradayVariation: z.coerce.number(),
  amount: z.coerce.number(),
  amountVariation: z.coerce.number(),
  variation: z.coerce.number(),
  symbol: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().min(1).max(24).nullable()),
  needsReview: z.boolean(),
  errors: z.array(z.string()).default([]),
  action: z.enum(["replace", "merge", "ignore"]).optional()
});

// Schéma d'une ligne de mise à jour Boursorama
const schemaBoursoramaLigneMiseAJour = schemaBoursoramaLigneConfirmation.extend({
  currentQuantity: z.coerce.number().optional(),
  csvQuantity: z.coerce.number().nonnegative(),
  quantityDiff: z.coerce.number(),
  currentAverageBuyPrice: z.coerce.number().optional(),
  csvAverageBuyPrice: z.coerce.number().nonnegative(),
  proposedAction: z.enum(["add", "update", "reduce", "delete", "unchanged", "ignore"]),
  positionId: z.coerce.number().int().positive().optional()
});

// Schéma d'une opération parsée depuis un avis d'opéré PDF
// Correspond à l'interface ParsedAvisOperation du package shared
const schemaAvisOpereLigne = z.object({
  id: z.string().min(1),
  dateExecution: z.string().optional(),
  nomValeur: z.string().optional(),
  isin: z.string().optional(),
  ticker: z.string().optional(),
  quantite: z.union([z.number(), z.string()]).optional(),
  sensOperation: z.enum(["achat", "vente", "inconnu"]),
  coursExecute: z.union([z.number(), z.string()]).optional(),
  montantTotalFrais: z.union([z.number(), z.string()]).optional(),
  devise: z.string().min(1),
  sourceFileName: z.string().optional(),
  rawTextSnippet: z.string().optional(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()),
  potentialDuplicate: z.boolean().optional(),
  resolvedAsset: z.object({
    symbol: z.string(),
    name: z.string(),
    confidenceScore: z.number()
  }).optional(),
  selectedSymbol: z.string().optional(),
  selectedAssetName: z.string().optional(),
  action: z.enum(["import", "ignore"]).optional()
});

importRouter.post("/import/boursorama/preview", asyncRoute(async (req, res) => {
  const corps = z.object({ content: z.string().min(1) }).parse(req.body);
  const apercu = await previewBoursoramaImport(corps.content);
  logger.debug("import", "CSV aperçu", { lignes: apercu.length, lignesEchouees: apercu.filter((l) => l.errors.length).length });
  res.json(apercu);
}));

importRouter.post("/import/boursorama/confirm", asyncRoute(async (req, res) => {
  const corps = z.object({ rows: z.array(schemaBoursoramaLigneConfirmation).max(1000) }).parse(req.body);
  const resultat = await confirmBoursoramaImport(corps.rows);
  const tache = dataConstructionQueue.enqueueFullConstruction(resultat.imported);
  logger.debug("import", "CSV confirmation", { lignes: corps.rows.length, importees: resultat.imported.length, ignorees: resultat.skipped.length, erreurs: resultat.errors.length });
  res.json({ ...resultat, jobId: tache.id, isPreparing: tache.totalTasks > 0 });
}));

importRouter.post("/import/boursorama/update-preview", asyncRoute(async (req, res) => {
  const corps = z.object({ content: z.string().min(1) }).parse(req.body);
  const apercu = await previewBoursoramaUpdate(corps.content);
  logger.debug("import", "CSV mise à jour aperçu", {
    lignes: apercu.length,
    lignesEchouees: apercu.filter((l) => l.errors.length).length,
    actions: apercu.reduce<Record<string, number>>((compteurs, l) => {
      compteurs[l.proposedAction] = (compteurs[l.proposedAction] ?? 0) + 1;
      return compteurs;
    }, {})
  });
  res.json(apercu);
}));

importRouter.post("/import/boursorama/update-confirm", asyncRoute(async (req, res) => {
  const corps = z.object({ rows: z.array(schemaBoursoramaLigneMiseAJour).max(1000) }).parse(req.body);
  const resultat = await confirmBoursoramaUpdate(corps.rows);
  const tache = dataConstructionQueue.enqueueFullConstruction(resultat.imported);
  logger.debug("import", "CSV mise à jour confirmation", { lignes: corps.rows.length, importees: resultat.imported.length, ignorees: resultat.skipped.length, erreurs: resultat.errors.length });
  res.json({ ...resultat, jobId: tache.id, isPreparing: tache.totalTasks > 0 });
}));

importRouter.post(
  "/import/avis-operes/preview",
  asyncRoute(async (req, res) => {
    const fichiers = await parseMultipartFiles(req, "files", { maxFiles: 20, maxFileSize: 10 * 1024 * 1024 });
    const apercu = await previewAvisOperesImport(fichiers);
    logger.debug("import", "PDF avis aperçu", { fichiers: fichiers.length, lignes: apercu.length, lignesAvecAvertissements: apercu.filter((l) => l.warnings.length).length });
    res.json(apercu);
  })
);

importRouter.post("/import/avis-operes/confirm", asyncRoute(async (req, res) => {
  // Validation explicite du schéma pour garantir l'intégrité des données envoyées en base
  const corps = z.object({ rows: z.array(schemaAvisOpereLigne).max(1000) }).parse(req.body);
  const resultat = await confirmAvisOperesImport(corps.rows);
  const tache = dataConstructionQueue.enqueueFullConstruction(resultat.imported);
  logger.debug("import", "PDF avis confirmation", { lignes: corps.rows.length, importees: resultat.imported.length, ignorees: resultat.skipped.length, erreurs: resultat.errors.length });
  res.json({ ...resultat, jobId: tache.id, isPreparing: tache.totalTasks > 0 });
}));
