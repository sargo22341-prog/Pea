import { MAX_CASH_STATEMENT_FILES } from "@pea/shared";
import express from "express";
import { z } from "zod";
import { requireAuthUser } from "../../../middleware/auth.js";
import { PDF_EXTRACTION_CONCURRENCY } from "../../../services/boursorama/pdf-text-extractor.js";
import { readCashStatement } from "../../../services/cash/cash-statements/cash-statement-file.js";
import { cashStatementsService } from "../../../services/cash/cash-statements/cash-statement-import.service.js";
import { monthlyCheck } from "../../../services/cash/cash-statements/monthly-check/monthly-check.service.js";
import { MAX_STATEMENT_FILE_BYTES } from "../../../services/cash/dividend-statements/statement-file.js";
import { assertDistinctUploads } from "../../../services/shared/upload-fingerprint.js";
import { HttpError } from "../../../utils/http-error.js";
import { mapWithConcurrency } from "../../../utils/map-limit.js";
import { asyncRoute } from "../../shared/async-route.js";
import { parseMultipartForm } from "../../shared/multipart.js";

export const cashStatementsRouter = express.Router();

/** Une soixantaine de lignes au plus par relevé mensuel : borne large du nombre de décisions. */
const MAX_LINES_PER_STATEMENT = 100;
const uploadLimits = { maxFiles: MAX_CASH_STATEMENT_FILES, maxFileSize: MAX_STATEMENT_FILE_BYTES };

const decisionsSchema = z.object({
  lines: z.array(z.object({
    key: z.string().trim().min(1).max(32),
    apply: z.boolean(),
    targetId: z.string().trim().regex(/^(?:transaction|movement|statement-line):\d+$/).optional(),
    positionId: z.coerce.number().int().positive().optional()
  }).strict()).max(MAX_CASH_STATEMENT_FILES * MAX_LINES_PER_STATEMENT)
}).strict();

function parseDecisions(raw: string | undefined) {
  try {
    return decisionsSchema.parse(JSON.parse(raw ?? ""));
  } catch {
    throw new HttpError(400, "Choix de l'import invalides.");
  }
}

async function uploadedForm(req: express.Request) {
  const form = await parseMultipartForm(req, "files", uploadLimits);
  assertDistinctUploads(form.files);
  return form;
}

/** Fichiers lus en mémoire quelques-uns à la fois ; aucun n'est conservé. */
function readAll(files: Awaited<ReturnType<typeof uploadedForm>>["files"]) {
  return mapWithConcurrency(files, PDF_EXTRACTION_CONCURRENCY, readCashStatement);
}

cashStatementsRouter.post("/cash/cash-statements/preview", asyncRoute(async (req, res) => {
  const userId = requireAuthUser(req).id;
  const form = await uploadedForm(req);
  res.json(cashStatementsService.preview(userId, await readAll(form.files)));
}));

cashStatementsRouter.post("/cash/cash-statements/confirm", asyncRoute(async (req, res) => {
  const userId = requireAuthUser(req).id;
  const form = await uploadedForm(req);
  const decisions = parseDecisions(form.fields["decisions"]);
  res.json(cashStatementsService.confirm(userId, await readAll(form.files), decisions));
}));

/** Contrôle mensuel : nouveau solde de chaque relevé importé contre le solde calculé, documents manquants. */
cashStatementsRouter.get("/cash/cash-statements/monthly-check", (req, res) => {
  res.json(monthlyCheck(requireAuthUser(req).id));
});
