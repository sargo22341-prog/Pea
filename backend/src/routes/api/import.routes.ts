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

importRouter.post("/import/boursorama/preview", asyncRoute(async (req, res) => {
  const body = z.object({ content: z.string().min(1) }).parse(req.body);
  const preview = await previewBoursoramaImport(body.content);
  logger.debug("import", "CSV preview", { rows: preview.length, rowsFailed: preview.filter((row) => row.errors.length).length });
  res.json(preview);
}));

importRouter.post("/import/boursorama/confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(z.any()) }).parse(req.body);
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
  const body = z.object({ rows: z.array(z.any()) }).parse(req.body);
  const result = await confirmBoursoramaUpdate(body.rows);
  const job = dataConstructionQueue.enqueueFullConstruction(result.imported);
  logger.debug("import", "CSV update confirm", { rows: body.rows.length, imported: result.imported.length, skipped: result.skipped.length, errors: result.errors.length });
  res.json({ ...result, jobId: job.id, isPreparing: job.totalTasks > 0 });
}));

importRouter.post(
  "/import/avis-operes/preview",
  express.raw({ type: "multipart/form-data", limit: "10mb" }),
  asyncRoute(async (req, res) => {
    const files = parseMultipartFiles(req, "files");
    const preview = await previewAvisOperesImport(files);
    logger.debug("import", "PDF avis preview", { files: files.length, rows: preview.length, rowsWithWarnings: preview.filter((row) => row.warnings.length).length });
    res.json(preview);
  })
);

importRouter.post("/import/avis-operes/confirm", asyncRoute(async (req, res) => {
  const body = z.object({ rows: z.array(z.any()) }).parse(req.body);
  const result = await confirmAvisOperesImport(body.rows);
  const job = dataConstructionQueue.enqueueFullConstruction(result.imported);
  logger.debug("import", "PDF avis confirm", { rows: body.rows.length, imported: result.imported.length, skipped: result.skipped.length, errors: result.errors.length });
  res.json({ ...result, jobId: job.id, isPreparing: job.totalTasks > 0 });
}));
