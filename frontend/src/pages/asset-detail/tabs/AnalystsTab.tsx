import type { AssetDetails } from "@pea/shared";
import { AssetAnalystConsensus } from "../components/AssetAnalystConsensus";
import { AnalystTrendBlock } from "../components/analysts/AnalystTrendBlock";
import { EarningsBlock } from "../components/analysts/EarningsBlock";

/** Onglet « Analystes » : consensus, tendance des recommandations et résultats trimestriels. */
export function AnalystsTab({ asset }: { asset: AssetDetails }) {
  return (
    <div className="space-y-4">
      {asset.analystConsensus ? <AssetAnalystConsensus currency={asset.quote.currency} data={asset.analystConsensus} /> : null}
      {asset.analystTrend ? <AnalystTrendBlock trend={asset.analystTrend} /> : null}
      {asset.earnings ? <EarningsBlock earnings={asset.earnings} fallbackCurrency={asset.quote.currency} /> : null}
    </div>
  );
}
