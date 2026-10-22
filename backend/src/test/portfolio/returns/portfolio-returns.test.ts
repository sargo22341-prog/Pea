import assert from "node:assert/strict";
import test from "node:test";
import type { PortfolioReturnsDto } from "@pea/shared";
import { runBackendScript } from "../../helpers/backend-script.js";
import { sessionUserHelpers } from "../../helpers/session-users.js";

/**
 * Portefeuille d'exemple : AAA acheté en 2024 puis renforcé et allégé en 2025 (avec un dividende),
 * BBB acheté puis entièrement vendu en 2025, CCC détenu sans transaction datée. Cours de clôture
 * figés aux 31 décembre, cotation actuelle de AAA à 150 €. Aucun appel réseau.
 */
const scenario = `
  const { db } = await import("./db.ts");
  const { marketDataService } = await import("./services/market/data/market-data.service.ts");
  const { marketSnapshotService } = await import("./services/market/snapshots/market-snapshot.service.ts");
  const { dividendsService } = await import("./services/market/dividends/dividends.service.ts");
  ${sessionUserHelpers}
  const owner = createUserWithSession("owner");
  const other = createUserWithSession("other");
  for (const symbol of ["AAA.PA", "BBB.PA", "CCC.PA"]) {
    db.prepare("INSERT INTO assets (symbol, name, exchange, currency) VALUES (?, ?, 'Paris', 'EUR')").run(symbol, symbol);
  }
  const insertPosition = db.prepare("INSERT INTO positions (user_id, symbol, name, quantity, average_buy_price, currency) VALUES (?, ?, ?, ?, ?, 'EUR')");
  const positionId = (userId, symbol, quantity) => {
    insertPosition.run(userId, symbol, symbol, quantity, 100);
    return db.prepare("SELECT id FROM positions WHERE user_id = ? AND symbol = ?").get(userId, symbol).id;
  };
  const aaa = positionId(owner.id, "AAA.PA", 15);
  const bbb = positionId(owner.id, "BBB.PA", 0);
  positionId(owner.id, "CCC.PA", 3);
  const otherAaa = positionId(other.id, "AAA.PA", 1);
  const insertTransaction = db.prepare("INSERT INTO transactions (position_id, type, quantity, price, total_fees, currency, traded_at) VALUES (?, ?, ?, ?, ?, 'EUR', ?)");
  insertTransaction.run(aaa, "buy", 10, 100, 0, "2024-01-02T10:00:00.000Z");
  insertTransaction.run(aaa, "buy", 10, 119.5, 5, "2025-07-01T10:00:00.000Z");
  insertTransaction.run(aaa, "sell", 5, 151, 5, "2025-12-01T10:00:00.000Z");
  insertTransaction.run(bbb, "buy", 4, 50, 0, "2025-02-03T10:00:00.000Z");
  insertTransaction.run(bbb, "sell", 4, 60, 0, "2025-05-05T10:00:00.000Z");
  insertTransaction.run(otherAaa, "buy", 1, 10, 0, "2023-01-02T10:00:00.000Z");

  const closes = {
    "AAA.PA": [["2024-01-02T16:30:00.000Z", 100], ["2024-12-31T16:30:00.000Z", 110], ["2025-12-31T16:30:00.000Z", 140], ["2026-02-27T16:30:00.000Z", 145]],
    "BBB.PA": [["2025-02-03T16:30:00.000Z", 50], ["2025-05-05T16:30:00.000Z", 60]]
  };
  const quoted = [];
  marketDataService.getChartData = async (symbol) => {
    const points = closes[symbol] ?? [];
    return { symbol, range: "ALL", interval: "1d", timestamps: points.map(([date]) => Date.parse(date)), prices: points.map(([, price]) => price), cachedAt: 0, expiresAt: 0 };
  };
  marketSnapshotService.getQuote = async (symbol) => {
    quoted.push(symbol);
    return { symbol, name: symbol, price: 150, currency: "EUR" };
  };
  dividendsService.readDividends = (symbol) => symbol === "AAA.PA"
    ? [{ symbol, date: "2025-06-02T00:00:00.000Z", amount: 2, currency: "EUR", status: "real" }, { symbol, date: "2026-06-01T00:00:00.000Z", amount: 2, currency: "EUR", status: "estimated" }]
    : [];
`;

test("yearly returns follow purchase dates, year-end prices, sales and dividends", () => {
  const result = runBackendScript(`
    ${scenario}
    const { runWithUser } = await import("./services/auth/user-context.ts");
    const { portfolioReturnsService } = await import("./services/portfolio/returns/portfolio-returns.service.ts");
    const output = await runWithUser(owner.id, () => portfolioReturnsService.returns(owner.id, new Date("2026-03-01T12:00:00.000Z")));
    console.log("__RESULT__" + JSON.stringify({ output, quoted }));
  `) as { output: PortfolioReturnsDto; quoted: string[] };

  const { output } = result;
  const summary = (year: number) => {
    const row = output.years.find((item) => item.year === year);
    assert.ok(row, `année ${String(year)} absente`);
    return { start: row.startValue, end: row.endValue, invested: row.invested, sold: row.sold, dividends: row.dividends, capitalGain: row.capitalGain, partial: row.partial };
  };

  assert.deepEqual(output.years.map((row) => row.year), [2024, 2025, 2026]);
  assert.deepEqual(summary(2024), { start: 0, end: 1100, invested: 1000, sold: 0, dividends: 0, capitalGain: 100, partial: true });
  // 2025 : achat de 10 AAA (1 200 € frais inclus), vente de 5 AAA (750 € nets), aller-retour BBB (+40 €), dividende 10 × 2 €.
  assert.deepEqual(summary(2025), { start: 1100, end: 2100, invested: 1400, sold: 990, dividends: 20, capitalGain: 590, partial: false });
  assert.deepEqual(summary(2026), { start: 2100, end: 2250, invested: 0, sold: 0, dividends: 0, capitalGain: 150, partial: true });
  assert.ok(Math.abs((output.years[0]?.returnPercent ?? 0) - 10) < 1e-9);
  assert.ok(Math.abs((output.years[2]?.returnPercent ?? 0) - (150 / 2100) * 100) < 1e-9);

  assert.equal(output.totalInvested, 2400);
  assert.equal(output.totalSold, 990);
  assert.equal(output.totalDividends, 20);
  assert.equal(output.currentValue, 2250);
  assert.equal(output.totalGain, 2250 + 990 + 20 - 2400);
  assert.ok(output.annualizedReturnPercent !== undefined && output.annualizedReturnPercent > 0);
  assert.equal(output.firstInvestmentAt, "2024-01-02T10:00:00.000Z");
  assert.deepEqual(output.undatedSymbols, ["CCC.PA"]);
  assert.deepEqual(output.missingPriceSymbols, []);
  // La position soldée vaut zéro : aucune cotation n'est demandée pour elle.
  assert.deepEqual(result.quoted, ["AAA.PA"]);
});

test("returns are private to their owner and require a session", () => {
  const result = runBackendScript(`
    ${scenario}
    const { app } = await import("./app.ts");
    const server = app.listen(0, "127.0.0.1", async () => {
      const baseUrl = "http://127.0.0.1:" + server.address().port;
      const call = (cookie) => fetch(baseUrl + "/api/portfolio/returns", { headers: cookie ? { Cookie: cookie } : {} });
      try {
        const ownerBody = await (await call(owner.cookie)).json();
        const otherBody = await (await call(other.cookie)).json();
        const anonymousStatus = (await call()).status;
        console.log("__RESULT__" + JSON.stringify({ ownerInvested: ownerBody.totalInvested, otherInvested: otherBody.totalInvested, otherYears: otherBody.years.map((row) => row.year), anonymousStatus }));
      } finally {
        server.close();
      }
    });
  `) as { ownerInvested: number; otherInvested: number; otherYears: number[]; anonymousStatus: number };

  assert.equal(result.ownerInvested, 2400);
  // L'autre compte ne voit que son propre achat de 10 € de 2023.
  assert.equal(result.otherInvested, 10);
  assert.equal(result.otherYears[0], 2023);
  assert.equal(result.anonymousStatus, 401);
});
