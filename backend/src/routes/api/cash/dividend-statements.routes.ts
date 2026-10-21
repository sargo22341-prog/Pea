import express from "express";
import { z } from "zod";
import { requireAuthUser } from "../../../middleware/auth.js";
import { cashAccountService } from "../../../services/cash/cash-account.service.js";
import { requireDividendMovement } from "../../../services/cash/dividends/dividend-credit.js";
import { dividendMovementService } from "../../../services/cash/dividends/dividend-movement.service.js";
import { MAX_STATEMENT_FILE_BYTES, MAX_STATEMENT_FILES, readSingleStatement, readStatement } from "../../../services/cash/dividend-statements/statement-file.js";
import { dividendStatementsService } from "../../../services/cash/dividend-statements/statement-import.service.js";
import { dividendStatementCheckService } from "../../../services/cash/dividend-statements/statement-single.service.js";
import { assertDistinctUploads } from "../../../services/shared/upload-fingerprint.js";
import { HttpError } from "../../../utils/http-error.js";
import { asyncRoute } from "../../shared/async-route.js";
import { isoDateTimeSchema } from "../../shared/date-time.schema.js";
import { parseMultipartForm } from "../../shared/multipart.js";

export const dividendStatementsRouter = express.Router();

const maxAmount = 1_000_000_000;
const idSchema = z.coerce.number().int().positive();
const uploadLimits = { maxFiles: MAX_STATEMENT_FILES, maxFileSize: MAX_STATEMENT_FILE_BYTES };

const decisionsSchema = z.object({
  lines: z.array(z.object({
    key: z.string().trim().min(1).max(32),
    apply: z.boolean(),
    positionId: idSchema.optional(),
    movementId: idSchema.optional()
  }).strict()).max(MAX_STATEMENT_FILES * 100),
  certifyOpening: z.boolean()
}).strict();

const correctionSchema = z.object({
  amount: z.coerce.number().positive().max(maxAmount).optional(),
  effectiveAt: isoDateTimeSchema.optional(),
  confirmUncertify: z.boolean().optional()
}).strict();

function parseDecisions(raw: string | undefined) {
  try {
    return decisionsSchema.parse(JSON.parse(raw ?? ""));
  } catch {
    throw new HttpError(400, "Choix de l'import invalides.");
  }
}

async function singleStatement(req: express.Request) {
  const form = await parseMultipartForm(req, "file", { maxFiles: 1, maxFileSize: MAX_STATEMENT_FILE_BYTES });
  const [file] = form.files;
  if (!file) throw new HttpError(400, "Aucun fichier fourni.");
  return { statement: await readSingleStatement(file), fields: form.fields };
}

dividendStatementsRouter.post("/cash/dividend-statements/preview", asyncRoute(async (req, res) => {
  const userId = requireAuthUser(req).id;
  const form = await parseMultipartForm(req, "files", uploadLimits);
  assertDistinctUploads(form.files);
  const reads = await Promise.all(form.files.map(readStatement));
  res.json(dividendStatementsService.preview(userId, reads));
}));

dividendStatementsRouter.post("/cash/dividend-statements/confirm", asyncRoute(async (req, res) => {
  const userId = requireAuthUser(req).id;
  const form = await parseMultipartForm(req, "files", uploadLimits);
  assertDistinctUploads(form.files);
  const decisions = parseDecisions(form.fields["decisions"]);
  const reads = await Promise.all(form.files.map(readStatement));
  res.json(dividendStatementsService.confirm(userId, reads, decisions));
}));

dividendStatementsRouter.post("/cash/movements/:id/verify", asyncRoute((req, res) => {
  res.json(dividendMovementService.verify(requireAuthUser(req).id, idSchema.parse(req.params["id"])));
}));

dividendStatementsRouter.put("/cash/movements/:id", asyncRoute((req, res) => {
  const id = idSchema.parse(req.params["id"]);
  res.json(dividendMovementService.correct(requireAuthUser(req).id, id, correctionSchema.parse(req.body ?? {})));
}));

dividendStatementsRouter.post("/cash/movements/:id/statement-check", asyncRoute(async (req, res) => {
  const userId = requireAuthUser(req).id;
  const id = idSchema.parse(req.params["id"]);
  // Appartenance vérifiée avant toute lecture du fichier : le dividende d'un autre utilisateur est introuvable.
  requireDividendMovement(userId, id);
  const { statement } = await singleStatement(req);
  res.json(dividendStatementCheckService.check(userId, id, statement));
}));

dividendStatementsRouter.post("/cash/movements/:id/statement-certify", asyncRoute(async (req, res) => {
  const userId = requireAuthUser(req).id;
  const id = idSchema.parse(req.params["id"]);
  // Appartenance vérifiée avant toute lecture du fichier : le dividende d'un autre utilisateur est introuvable.
  requireDividendMovement(userId, id);
  const { statement, fields } = await singleStatement(req);
  dividendStatementCheckService.certify(userId, id, statement, fields["correct"] === "true");
  res.json(cashAccountService.ledger(userId));
}));
