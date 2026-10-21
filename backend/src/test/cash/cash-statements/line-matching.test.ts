import assert from "node:assert/strict";
import test from "node:test";
import { COUPON_EARLY_WRITE_DAYS, COUPON_WRITE_DELAY_DAYS, TRADE_EARLY_WRITE_DAYS, TRADE_WRITE_DELAY_DAYS, dayNumber, isoDayOf } from "../../../services/cash/cash-statements/matching/match-windows.js";
import { assignTargets, lineCandidates, type MatchElement, type MatchLine } from "../../../services/cash/cash-statements/matching/line-matching.js";

const shift = (day: string, days: number) => isoDayOf(dayNumber(day) + days);
const element = (id: string, kind: MatchElement["kind"], day: string, cashCents: number, quantity?: number): MatchElement => ({ id, kind, day, effectiveAt: `${day}T10:00:00.000Z`, cashCents, quantity });
const line = (kind: MatchLine["kind"], amountCents: number, operationDate: string, quantity?: number): MatchLine => ({ key: "2026-03#1", kind, amountCents, operationDate, quantity });
const ids = (elements: MatchElement[]) => elements.map((candidate) => candidate.id);

test("achat : même sens, montant au centime, quantité et fenêtre d'écriture, bornes comprises", () => {
  const written = "2026-03-16";
  const buy = (id: string, days: number, cents = -96_840, quantity = 37) => element(id, "buy", shift(written, -days), cents, quantity);
  const elements = [
    buy("at-max-delay", TRADE_WRITE_DELAY_DAYS),
    buy("too-old", TRADE_WRITE_DELAY_DAYS + 1),
    buy("early", -TRADE_EARLY_WRITE_DAYS),
    buy("too-early", -TRADE_EARLY_WRITE_DAYS - 1),
    buy("other-cent", 0, -96_841),
    buy("other-quantity", 0, -96_840, 36),
    element("sell", "sell", written, 96_840, 37)
  ];
  assert.deepEqual(ids(lineCandidates(line("buy", -96_840, written, 37), elements)), ["at-max-delay", "early"]);
});

test("coupon : écrit jusqu'à la fin de la fenêtre après le paiement, ou peu avant une saisie manuelle", () => {
  const written = "2026-03-20";
  const coupon = (id: string, days: number) => element(id, "dividend", shift(written, -days), 459);
  const elements = [coupon("late", COUPON_WRITE_DELAY_DAYS), coupon("too-late", COUPON_WRITE_DELAY_DAYS + 1), coupon("manual-after", -COUPON_EARLY_WRITE_DAYS), coupon("too-far-after", -COUPON_EARLY_WRITE_DAYS - 1)];
  assert.deepEqual(ids(lineCandidates(line("dividend", 459, written), elements)), ["late", "manual-after"]);
});

test("le sens fait partie du critère : un retrait n'est jamais un versement du même montant", () => {
  const elements = [element("deposit", "deposit", "2026-03-17", 200_000), element("withdrawal", "withdrawal", "2026-03-17", -200_000)];
  assert.deepEqual(ids(lineCandidates(line("withdrawal", -200_000, "2026-03-17"), elements)), ["withdrawal"]);
});

test("attribution : un candidat unique est pris et sort des candidats des autres lignes", () => {
  const result = assignTargets([{ key: "a", candidates: ["x"] }, { key: "b", candidates: ["x", "y"] }], new Map([["x", 0], ["y", 1]]));
  assert.equal(result.get("a")?.target, "x");
  assert.equal(result.get("b")?.target, "y");
});

test("attribution : des lignes identiques et autant d'éléments identiques sont appariés dans l'ordre chronologique", () => {
  const result = assignTargets([{ key: "a", candidates: ["y", "x"] }, { key: "b", candidates: ["x", "y"] }], new Map([["x", 0], ["y", 1]]));
  assert.deepEqual([result.get("a")?.target, result.get("b")?.target], ["x", "y"]);
});

test("attribution : une ligne et deux éléments candidats restent ambigus, jamais un choix silencieux", () => {
  const result = assignTargets([{ key: "a", candidates: ["x", "y"] }], new Map([["x", 0], ["y", 1]]));
  assert.deepEqual(result.get("a"), { candidates: ["x", "y"] });
});

test("attribution : un élément pris par une ligne n'est plus proposé, même s'il était le seul candidat d'une autre", () => {
  const result = assignTargets([{ key: "a", candidates: ["x"] }, { key: "b", candidates: ["x"] }], new Map([["x", 0]]));
  assert.equal(result.get("a")?.target, "x");
  assert.deepEqual(result.get("b"), { candidates: [] });
});
