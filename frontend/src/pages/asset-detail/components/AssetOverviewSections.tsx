import type { AssetDetails, RangeKey } from "@pea/shared";
import { DividendLineChartSection } from "../../../components/charts/DividendLineChartSection";
import { FinancialComboChart } from "../../../components/charts/FinancialComboChart";
import { AssetMarketInfo } from "./AssetMarketInfo";
import { AssetPositionSummary } from "./AssetPositionSummary";

export function AssetOverviewSections({
  asset,
  currentPrice,
  firstPriceOfRange,
  range
}: {
  asset: AssetDetails;
  currentPrice: number;
  firstPriceOfRange?: number;
  range: RangeKey;
}) {
  const { dividends, marketInfo, position, quote } = asset;

  return (
    <>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="group p-5">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-300">Ma position</h2>
          {position ? (
            <AssetPositionSummary
              currentPrice={currentPrice}
              firstPriceOfRange={firstPriceOfRange}
              position={position}
              range={range}
              rangePerformance={asset.positionRangePerformance}
              stats={asset.positionStats}
            />
          ) : (
            <p className="text-slate-400">Aucune position détenue pour ce symbole.</p>
          )}
        </div>

        <div className="group p-5">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-300">Informations marché</h2>
          <AssetMarketInfo currency={quote.currency} hasKnownDividends={dividends.length > 0} marketInfo={marketInfo} quote={quote} />
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row">
        {!asset.isEtf && asset.financials && asset.financials.length > 0 ? (
          <section className="card min-w-0 flex-1 p-4">
            <h2 className="mb-4 font-semibold">Revenue / Net Income / Marge</h2>
            <FinancialComboChart data={asset.financials} />
          </section>
        ) : null}

        <div className="min-w-0 flex-1">
          {!asset.isEtf && dividends && dividends.length > 0 ? (
            <section className="card overflow-hidden">
              <h2 className="mb-4 font-semibold">Dividende</h2>
              <DividendLineChartSection
                averageBuyPrice={position?.averageBuyPrice}
                currentPrice={currentPrice}
                dividends={dividends}
                marketInfo={marketInfo}
              />
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
