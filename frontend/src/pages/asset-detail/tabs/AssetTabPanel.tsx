import type { AssetDetails, AssetInsights, RangeKey } from "@pea/shared";
import { MOTION } from "../../../components/common/motion";
import { NewsArticleList } from "../../../components/common/NewsArticleList";
import { EtfComposition } from "../components/etf/EtfComposition";
import { EtfPerformance } from "../components/etf/EtfPerformance";
import { AnalystsTab } from "./AnalystsTab";
import { DividendsTab } from "./DividendsTab";
import type { AssetTabId } from "./asset-tabs";
import { FundamentalsTab } from "./FundamentalsTab";
import { OverviewTab } from "./OverviewTab";

/**
 * Contenu de l'onglet actif. Seul cet onglet est monté : un onglet jamais ouvert ne déclenche
 * aucune requête (calendrier, actualités...).
 */
export function AssetTabPanel({
  tab,
  asset,
  currentPrice,
  firstPriceOfRange,
  insights,
  onCompare,
  range,
  symbol
}: {
  tab: AssetTabId;
  asset: AssetDetails;
  currentPrice: number;
  firstPriceOfRange?: number | undefined;
  insights: AssetInsights | null;
  onCompare: (target: { symbol: string; name: string }) => void;
  range: RangeKey;
  symbol: string;
}) {
  return (
    <div className={MOTION.rise} key={tab} role="tabpanel">
      {tab === "overview" ? (
        <OverviewTab asset={asset} currentPrice={currentPrice} firstPriceOfRange={firstPriceOfRange} insights={insights} onCompare={onCompare} range={range} symbol={symbol} />
      ) : null}
      {tab === "fundamentals" ? <FundamentalsTab asset={asset} /> : null}
      {tab === "analysts" ? <AnalystsTab asset={asset} /> : null}
      {tab === "dividends" ? <DividendsTab asset={asset} currentPrice={currentPrice} /> : null}
      {tab === "news" ? <NewsArticleList articles={asset.news} /> : null}
      {tab === "composition" && asset.fundDetails ? <EtfComposition data={asset.fundDetails} /> : null}
      {tab === "performance" && asset.fundDetails ? <EtfPerformance data={asset.fundDetails} /> : null}
    </div>
  );
}
