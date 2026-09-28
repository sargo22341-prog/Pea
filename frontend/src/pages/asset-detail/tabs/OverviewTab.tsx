import type { AssetDetails, AssetInsights, RangeKey } from "@pea/shared";
import { useTranslation } from "react-i18next";
import { AssetCalendarEvents } from "../../../components/common/AssetCalendarEvents";
import { AssetMarketInfo } from "../components/AssetMarketInfo";
import { AssetPositionSummary } from "../components/AssetPositionSummary";
import { EtfSummary } from "../components/etf/EtfSummary";
import { InsightsBlock } from "../components/insights/InsightsBlock";
import { SimilarAssetsRow } from "../components/similar/SimilarAssetsRow";

/** Onglet « Aperçu » : position, marché, identité du fonds, signaux, calendrier puis actifs similaires. */
export function OverviewTab({
  asset,
  currentPrice,
  firstPriceOfRange,
  insights,
  onCompare,
  range,
  symbol
}: {
  asset: AssetDetails;
  currentPrice: number;
  firstPriceOfRange?: number | undefined;
  insights: AssetInsights | null;
  onCompare: (target: { symbol: string; name: string }) => void;
  range: RangeKey;
  symbol: string;
}) {
  const { t } = useTranslation("asset");
  const { dividends, marketInfo, position, quote } = asset;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="group p-5">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-300">{t("myPosition")}</h2>
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
            <p className="text-slate-400">{t("noPosition")}</p>
          )}
        </div>

        <div className="group p-5">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-300">{t("marketInfo")}</h2>
          <AssetMarketInfo currency={quote.currency} hasKnownDividends={dividends.length > 0} marketInfo={marketInfo} quote={quote} />
        </div>
      </section>

      {asset.isEtf && asset.fundDetails ? <EtfSummary currency={quote.currency} data={asset.fundDetails} /> : null}

      {insights ? <InsightsBlock currency={quote.currency} insights={insights} /> : null}

      <AssetCalendarEvents symbol={symbol} />

      <SimilarAssetsRow onCompare={onCompare} symbol={symbol} />
    </div>
  );
}
