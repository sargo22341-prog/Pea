import { COMPARE_MAX_SYMBOLS, type RangeKey, type User } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { CompareModal } from "../../components/common/CompareModal";
import { MOTION } from "../../components/common/motion";
import { useFeatureEnabled } from "../../contexts/feature-flags-context";
import { useAssetComparisonSeries } from "../../hooks/useAssetComparisonSeries";
import { useMarketEventReload } from "../../hooks/useMarketEventReload";
import { normalizeTimeZone } from "../../lib/timezone";
import { compareLink } from "../compare/compare-symbols";
import { AssetDetailHeader } from "./components/AssetDetailHeader";
import { AssetHistorySection } from "./components/AssetHistorySection";
import { CreateAlertModal } from "./components/alerts/CreateAlertModal";
import { EditPositionModal } from "./components/EditPositionModal";
import { chartReferenceLevels, hasChartLevels } from "./components/insights/insight-levels";
import { SplitBanner } from "./components/splits/SplitBanner";
import { useAssetChartLifecycle } from "./hooks/useAssetChartLifecycle";
import { useAssetDetailData } from "./hooks/useAssetDetailData";
import { useAssetDocumentTitle } from "./hooks/useAssetDocumentTitle";
import { useAssetInsights } from "./hooks/useAssetInsights";
import { useAssetWatchlist } from "./hooks/useAssetWatchlist";
import { useChartOverlays } from "./hooks/useChartOverlays";
import { useKeepPageAtTop } from "./hooks/useKeepPageAtTop";
import { usePendingSplits } from "./hooks/usePendingSplits";
import { usePositionEditor } from "./hooks/usePositionEditor";
import { availableAssetTabs } from "./tabs/asset-tabs";
import { AssetTabBar } from "./tabs/AssetTabBar";
import { AssetTabPanel } from "./tabs/AssetTabPanel";
import { useAssetTab } from "./tabs/useAssetTab";

/** Debounce des rechargements déclenchés par les événements marché de cet actif. */
const MARKET_EVENT_RELOAD_DEBOUNCE_MS = 300;

export function AssetDetailPage({ user }: { user: User }) {
  const { t } = useTranslation("asset");
  const { symbol = "" } = useParams();
  const [range, setRange] = useState<RangeKey>(() => user.defaultChartRange);
  const [comparing, setComparing] = useState(false);
  const [creatingAlert, setCreatingAlert] = useState(false);
  const alertsEnabled = useFeatureEnabled("alerts");
  const [compareTargets, setCompareTargets] = useState<{ symbol: string; name: string }[]>([]);
  const { series: comparisonSeries, error: comparisonError, preparingSymbols } = useAssetComparisonSeries(compareTargets, range);
  const { levels: levelsSelected, overlays, toggleLevels, toggleOverlay } = useChartOverlays();
  const asset = useAssetDetailData(symbol, range, overlays);
  const { chartPendingOpenConfirmation, chartPoints, chartRefreshing, displayChart } = useAssetChartLifecycle({
    asset: asset.data,
    loading: asset.loading,
    range,
    reload: asset.reload,
    symbol
  });
  const editor = usePositionEditor({ position: asset.data?.position, quote: asset.data?.quote, reload: asset.reload });
  const { toggleWatchlist, watchlisted } = useAssetWatchlist({
    initialWatchlisted: asset.data?.isInWatchlist,
    onError: editor.setToast,
    quote: asset.data?.quote
  });
  const splits = usePendingSplits(symbol, asset.reload);
  const insights = useAssetInsights(symbol);
  const tabs = asset.data ? availableAssetTabs(asset.data, { newsEnabled: user.assetNewsEnabled }) : [];
  const { activeTab, selectTab } = useAssetTab(tabs);

  useMarketEventReload({
    debounceMs: MARKET_EVENT_RELOAD_DEBOUNCE_MS,
    eventTypes: ["asset-annex-updated", "market-snapshot-updated"],
    filterEvent: (payload) => {
      const key = symbol.toUpperCase();
      return payload.symbol?.toUpperCase() === key || payload.symbols?.some((item) => item.toUpperCase() === key) === true;
    },
    reload: asset.reload,
    reloadOnFocus: false,
    reloadOnVisibility: false
  });
  useKeepPageAtTop(symbol, Boolean(asset.data));

  function addCompareTarget(target: { symbol: string; name: string }) {
    setCompareTargets((prev) => (prev.some((item) => item.symbol === target.symbol) ? prev : [...prev, target]));
  }
  useAssetDocumentTitle(asset.data?.quote.name, symbol);

  if (asset.loading && !asset.data) return <div className="card p-6">{t("loadingAsset", { symbol })}</div>;
  if (asset.error) return <div className="card border-coral p-6 text-coral">{asset.error}</div>;
  if (!asset.data) return null;

  const { quote, position, marketInfo, chart, marketSession } = asset.data;
  const userTimezone = normalizeTimeZone(asset.data.appTimezone);
  const marketUnavailable = quote.unavailable || position?.marketDataUnavailable;
  const dayChange = range === "1d" ? marketInfo?.regularMarketChange ?? quote.change : undefined;
  const dayChangePercent = range === "1d" ? marketInfo?.regularMarketChangePercent ?? quote.changePercent : undefined;
  const firstClose = range === "1d"
    ? marketInfo?.regularMarketPreviousClose ?? quote.previousClose ?? chart?.baselinePrice ?? chart?.prices[0]
    : chart?.prices[0];
  const displayPrice = marketInfo?.regularMarketPrice ?? quote.price;

  return (
    <>
      <div className={`space-y-6 ${MOTION.stagger}`}>
        <AssetDetailHeader
          displayPrice={displayPrice}
          marketUnavailable={marketUnavailable}
          onAdd={() => void editor.openPositionEditor()}
          onCreateAlert={alertsEnabled ? () => { setCreatingAlert(true); } : undefined}
          onEdit={() => { editor.setEditing(true); }}
          onToggleWatchlist={() => void toggleWatchlist()}
          peaEligibilityStatus={asset.data.peaEligibility.status}
          positionExists={Boolean(position)}
          quote={quote}
          rangeChange={dayChange ?? chart?.performanceEuro ?? 0}
          rangeChangePercent={dayChangePercent ?? chart?.performancePercent ?? 0}
          stale={asset.data.stale}
          watchlisted={watchlisted}
        />

        {editor.toast && <div className="card border-mint/40 p-3 text-sm text-mint">{editor.toast}</div>}
        {editor.openingPositionEditor ? <div className="card border-mint/40 p-3 text-sm text-mint">{t("openingPositionEditor")}</div> : null}
        <SplitBanner decidingId={splits.decidingId} error={splits.error} onDecide={(split, decision) => void splits.decide(split, decision)} splits={splits.pending} />

        <AssetHistorySection
          chart={chart}
          chartPendingOpenConfirmation={chartPendingOpenConfirmation}
          chartPoints={chartPoints}
          chartRefreshing={chartRefreshing}
          compareTargetsCount={compareTargets.length}
          comparisonError={comparisonError}
          comparisonSeries={comparisonSeries}
          displayChart={displayChart}
          loading={asset.loading}
          marketSession={marketSession}
          onCompare={() => { setComparing(true); }}
          onRangeChange={setRange}
          levels={{ available: hasChartLevels(insights), selected: levelsSelected, onToggle: toggleLevels }}
          onToggleOverlay={toggleOverlay}
          overlays={overlays}
          referenceLevels={levelsSelected && insights ? chartReferenceLevels(insights, t) : undefined}
          preparingSymbols={preparingSymbols}
          quoteCurrency={quote.currency}
          range={range}
          stale={asset.data.stale}
          symbol={symbol}
          userTimezone={userTimezone}
        />

        <AssetTabBar active={activeTab} onSelect={selectTab} tabs={tabs} />
        <AssetTabPanel
          asset={asset.data}
          currentPrice={displayPrice}
          firstPriceOfRange={firstClose}
          insights={insights}
          onCompare={(target) => { addCompareTarget(target); setComparing(true); }}
          range={range}
          symbol={symbol}
          tab={activeTab}
        />
      </div>

      {/* Fenetres modales hors cascade : un voile `position: fixed` ne doit pas heriter d'un `transform` anime. */}
      {editor.editing && editor.editedPosition && (
        <EditPositionModal
          onClose={() => void editor.closePositionEditor()}
          onDeleted={() => void editor.deletePosition()}
          onSaved={editor.refreshAfterEdit}
          position={editor.editedPosition}
          startWithDraft={editor.startWithDraft}
        />
      )}
      {creatingAlert && (
        <CreateAlertModal currency={quote.currency} currentPrice={displayPrice} name={quote.name} onClose={() => { setCreatingAlert(false); }} symbol={quote.symbol} />
      )}
      {comparing && (
        <CompareModal
          currentSymbol={symbol}
          localPeaSearchEnabled={user.localPeaSearchEnabled}
          onAdd={addCompareTarget}
          onClose={() => { setComparing(false); }}
          onRemove={(targetSymbol) => { setCompareTargets((prev) => prev.filter((item) => item.symbol !== targetSymbol)); }}
          detailedCompareHref={compareLink([symbol, ...compareTargets.map((target) => target.symbol)].slice(0, COMPARE_MAX_SYMBOLS))}
          selected={compareTargets}
        />
      )}
    </>
  );
}
