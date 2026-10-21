import assert from "node:assert/strict";
import test from "node:test";
import { runBackendScript } from "../../helpers/backend-script.js";

interface Result {
  firstImport: { openingCertified: boolean };
  storedLines: { period: string; line_no: number; net_cents: number }[];
  account: { opening_dividends_cents: number | null; opening_dividends_certified_at: string | null };
  coupon: { case: string; target?: { id: string } };
  bobCoupon: { case: string };
  link: { dividend_line_id: number | null };
  certify: { openingCertified: boolean; account: Result["account"] };
}

/**
 * Régression : relevés de coupons importés sans cocher « Certifier ce montant », puis relevés
 * espèces. Chaque coupon d'avant l'état initial était signalé « relevé de coupons manquant »
 * alors que le relevé venait d'être importé, faute de ligne conservée.
 */
test("coupon d'avant l'état initial : rapproché de son relevé de coupons même sans certifier les dividendes déjà perçus", () => {
  const result = runBackendScript(`
    const fs = await import("node:fs");
    const { db } = await import("./db.ts");
    const { parseCashStatement } = await import("./services/cash/cash-statements/parser/cash-statement-parser.ts");
    const { parseDividendStatement } = await import("./services/cash/dividend-statements/parser/statement-parser.ts");
    const { cashStatementsService } = await import("./services/cash/cash-statements/cash-statement-import.service.ts");
    const { dividendStatementsService } = await import("./services/cash/dividend-statements/statement-import.service.ts");
    const now = new Date("2026-10-20T12:00:00.000Z");

    const user = (name) => { db.prepare("INSERT INTO users (username, password_hash) VALUES (?, 'hash')").run(name); return db.prepare("SELECT id FROM users WHERE username = ?").get(name).id; };
    const alice = user("alice");
    const bob = user("bob");
    for (const id of [alice, bob]) {
      db.prepare("INSERT INTO cash_accounts (user_id, status, reference_at, opening_cash_cents, opening_deposits_cents) VALUES (?, 'ready', '2026-10-01T00:00:00.000Z', 22625, 40000)").run(id);
      db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency, isin) VALUES (?, 'ENGI.PA', 'ENGIE', 2, 11.5, 'EUR', 'FR0010208488')").run(id);
    }
    const coupons = () => [{ fileName: "coupons-08-2021.pdf", statement: parseDividendStatement([
      "COUPONS REMBOURSEMENTS : AOUT 2021", "DETAIL COUPONS",
      "06/08/2021 2 ENGIE (FR0010208488) 1,70 1,70 1,70",
      "TOTAL EUR 0,00 0,00 1,70 0,00 1,70", "COUPONS : NETS FISCAUX 1,70 EUR", "Feuillet 1/1"
    ].join("\\n")) }];
    const cash = () => [{ fileName: "especes-08-2021.pdf", statement: parseCashStatement(fs.readFileSync("test/fixtures/cash-statements/legacy-second-month.txt", "utf8")) }];
    const couponLine = (userId) => cashStatementsService.preview(userId, cash(), now).statements[0].lines.find((line) => line.kind === "dividend");
    const account = () => db.prepare("SELECT opening_dividends_cents, opening_dividends_certified_at FROM cash_accounts WHERE user_id = ?").get(alice);

    // Comme l'interface par défaut : la case « Certifier ce montant » n'est pas cochée.
    const firstImport = dividendStatementsService.confirm(alice, coupons(), { lines: [], certifyOpening: false }, now);
    const storedLines = db.prepare("SELECT period, line_no, net_cents FROM cash_dividend_statement_lines WHERE user_id = ?").all(alice);
    const accountAfterImport = account();
    const coupon = couponLine(alice);
    const bobCoupon = couponLine(bob);
    cashStatementsService.confirm(alice, cash(), { lines: [{ key: coupon.key, apply: true }] }, now);
    const link = db.prepare("SELECT dividend_line_id FROM cash_statement_lines WHERE user_id = ? AND period = '2021-08' AND line_no = ?").get(alice, coupon.lineNo);

    // Réimport en cochant la case : le total des lignes conservées devient le montant confirmé.
    const certified = dividendStatementsService.confirm(alice, coupons(), { lines: [], certifyOpening: true }, now);

    console.log("__RESULT__" + JSON.stringify({
      firstImport, storedLines, account: accountAfterImport, coupon, bobCoupon, link,
      certify: { openingCertified: certified.openingCertified, account: account() }
    }));
  `) as Result;

  assert.equal(result.firstImport.openingCertified, false);
  assert.deepEqual(result.storedLines, [{ period: "2021-08", line_no: 1, net_cents: 170 }], "la ligne du relevé de coupons est conservée");
  assert.deepEqual(result.account, { opening_dividends_cents: null, opening_dividends_certified_at: null }, "le montant déclaré n'est pas modifié sans la case");
  assert.equal(result.coupon.case, "verify", "le coupon n'est plus signalé « relevé de coupons manquant »");
  assert.match(result.coupon.target?.id ?? "", /^statement-line:\d+$/);
  assert.equal(result.bobCoupon.case, "missing_dividend", "la ligne d'Alice n'est jamais candidate pour Bob");
  assert.ok(result.link.dividend_line_id, "la ligne du relevé espèces est rapprochée de la ligne de coupons");
  assert.deepEqual(result.certify, { openingCertified: true, account: { opening_dividends_cents: 170, opening_dividends_certified_at: "2026-10-20T12:00:00.000Z" } });
});
