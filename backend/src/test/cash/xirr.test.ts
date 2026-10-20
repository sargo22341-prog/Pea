import assert from "node:assert/strict";
import test from "node:test";
import { xirr } from "../../services/cash/xirr.js";

const yearMs = 365.25 * 24 * 60 * 60 * 1000;
const start = Date.UTC(2024, 0, 1);

test("XIRR d'un apport unique valorisé 10 % plus haut un an après", () => {
  const rate = xirr([{ timeMs: start, amount: -1000 }, { timeMs: start + yearMs, amount: 1100 }]);
  assert.ok(rate !== undefined && Math.abs(rate - 0.1) < 1e-6, `taux ${rate}`);
});

test("XIRR tient compte de la date des apports", () => {
  // Le second apport n'a travaillé que six mois : le taux dépasse le gain simple de 10 %.
  const rate = xirr([
    { timeMs: start, amount: -1000 },
    { timeMs: start + yearMs / 2, amount: -1000 },
    { timeMs: start + yearMs, amount: 2200 }
  ]);
  assert.ok(rate !== undefined && rate > 0.12 && rate < 0.14, `taux ${rate}`);
});

test("XIRR indéfini sans flux de signes opposés ou sur une période trop courte", () => {
  assert.equal(xirr([{ timeMs: start, amount: -1000 }]), undefined);
  assert.equal(xirr([{ timeMs: start, amount: -1000 }, { timeMs: start + 1000, amount: 1001 }], yearMs / 4), undefined);
});
