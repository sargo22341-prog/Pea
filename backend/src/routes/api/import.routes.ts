/**
 * Role du fichier : declarer les routes d'import Boursorama et avis d'operes.
 */

import express from "express";
import { z } from "zod";
import { confirmAvisOperesImport, previewAvisOperesImport } from "../../services/boursorama/importAvisOperes.service.js";
import { confirmBoursoramaImport, confirmBoursoramaUpdate, previewBoursoramaImport, previewBoursoramaUpdate } from "../../services/boursorama/importBoursorama.service.js";
import { logger } from "../../services/shared/logger.service.js";
import { dataConstructionQueue } from "../../services/market/data-construction-queue.service.js";
import { asyncRoute } from "../shared/async-route.js";
import { parseMultipartFiles } from "../shared/multipart.js";

export const importRouter = express.Router();

const boursoramaConfirmRowSchema = z.object({
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
  symbol: z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? null : value), z.string().trim().min(1).max(24).nullable()),
  needsReview: z.boolean(),
  errors: z.array(z.string()).default([]),
  action: z.enum(["replace", "merge", "ignore"]).optional()
}).passthrough();

const boursoramaUpdateConfirmRowSchema = boursoramaConfirmRowSchema.extend({
  currentQuantity: z.coerce.number().optional(),
  csvQuantity: z.coerce.number().nonnegative(),
  quantityDiff: z.coerce.number(),
  currentAverageBuyPrice: z.coerce.number().optional(),
  csvAverageBuyPrice: z.coerce.number().nonnegative(),
  proposedAction: z.enum(["add", "update", "reduce", "delete", "unchanged", "ignore"]),
  positionId: z.coerce.number().int().positive().optional()
}).passthrough();

importRouter.post("/import/boursorama/preview", asyncRoute(async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  const preview = await previewBoursoramaImport(body.content);
  logger.debug("import", "CSV preview", { rows: preview.length, rowsFailed: preview.filter((row) => row.errors.length).length });
  res.json(preview);
}));

importRouter.post("/import/boursorama/confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(boursoramaConfirmRowSchema).max(1000) }).parse(req.body);
  const result = await confirmBoursoramaImport(body.rows);
  const job = dataConstructionQueue.enqueueFullConstruction(result.imported);
  logger.debug("import", "CSV confirm", { rows: body.rows.length, imported: result.imported.length, skipped: result.skipped.length, errors: result.errors.length });
  res.json({ ...result, jobId: job.id, isPreparing: job.totalTasks > 0 });
}));

importRouter.post("/import/boursorama/update-preview", asyncRoute(async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  const preview = await previewBoursoramaUpdate(body.content);
  logger.debug("import", "CSV update preview", {
    rows: preview.length,
    rowsFailed: preview.filter((row) => row.errors.length).length,
    actions: preview.reduce<Record<string, number>>((counts, row) => {
      counts[row.proposedAction] = (counts[row.proposedAction] ?? 0) + 1;
      return counts;
    }, {})
  });
  res.json(preview);
}));

importRouter.post("/import/boursorama/update-confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(boursoramaUpdateConfirmRowSchema).max(1000) }).parse(req.body);
  const result = await confirmBoursoramaUpdate(body.rows);
  const job = dataConstructionQueue.enqueueFullConstruction(result.imported);
  logger.debug("import", "CSV update confirm", { rows: body.rows.length, imported: result.imported.length, skipped: result.skipped.length, errors: result.errors.length });
  res.json({ ...result, jobId: job.id, isPreparing: job.totalTasks > 0 });
}));

importRouter.post(
  "/import/avis-operes/preview",
  asyncRoute(async (req, res) => {
    const files = await parseMultipartFiles(req, "files", { maxFiles: 20, maxFileSize: 10 * 1024 * 1024 });
    const preview = await previewAvisOperesImport(files);
    logger.debug("import", "PDF avis preview", { files: files.length, rows: preview.length, rowsWithWarnings: preview.filter((row) => row.warnings.length).length });
    res.json(preview);
  })
);

importRouter.post("/import/avis-operes/confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(z.unknown()).max(1000) }).parse(req.body);
  const result = await confirmAvisOperesImport(body.rows);
  const job = dataConstructionQueue.enqueueFullConstruction(result.imported);
  logger.debug("import", "PDF avis confirm", { rows: body.rows.length, imported: result.imported.length, skipped: result.skipped.length, errors: result.errors.length });
  res.json({ ...result, jobId: job.id, isPreparing: job.totalTasks > 0 });
}));
