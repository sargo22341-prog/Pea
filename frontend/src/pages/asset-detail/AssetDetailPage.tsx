import type { PositionWithMarket, RangeKey, User } from "@pea/shared";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { AssetCalendarEvents } from "../../components/common/AssetCalendarEvents";
import { CompareModal } from "../../components/common/CompareModal";
import { NewsArticleList } from "../../components/common/NewsArticleList";
import { useAsync } from "../../hooks/useAsync";
import { useAssetComparisonSeries } from "../../hooks/useAssetComparisonSeries";
import { useMarketEventReload } from "../../hooks/useMarketEventReload";
import { api } from "../../lib/api";
import { normalizeTimeZone } from "../../lib/timezone";
import { AssetAnalystConsensus } from "./components/AssetAnalystConsensus";
import { AssetDetailHeader } from "./components/AssetDetailHeader";
import { AssetEtfFundDetails } from "./components/AssetEtfFundDetails";
import { AssetHistorySection } from "./components/AssetHistorySection";
import { AssetOverviewSections } from "./components/AssetOverviewSections";
import { EditPositionModal } from "./components/EditPositionModal";
import { useAssetChartLifecycle } from "./hooks/useAssetChartLifecycle";
import { useAssetWatchlist } from "./hooks/useAssetWatchlist";

function scrollToPageTop() {
  window.scrollTo({ left: 0, top: 0, behavior: "auto" });
  document.scrollingElement?.scrollTo({ left: 0, top: 0, behavior: "auto" });
}

function keepPageAtTopForInitialPaint(frameCount: number) {
  let remainingFrames = frameCount;
  let frameHandle: number | undefined;
  let cancelled = false;

  const requestFrame = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
  const cancelFrame = window.cancelAnimationFrame ?? ((handle: number) => window.clearTimeout(handle));
  const cancel = () => {
    cancelled = true;
    if (frameHandle !== undefined) cancelFrame(frameHandle);
  };

  const tick = () => {
    scrollToPageTop();
    remainingFrames -= 1;
    if (!cancelled && remainingFrames > 0) frameHandle = requestFrame(tick);
  };

  window.addEventListener("touchstart", cancel, { passive: true, once: true });
  window.addEventListener("wheel", cancel, { passive: true, once: true });
  window.addEventListener("pointerdown", cancel, { passive: true, once: true });
  window.addEventListener("keydown", cancel, { once: true });
  tick();

  return () => {
    cancel();
    window.removeEventListener("touchstart", cancel);
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("pointerdown", cancel);
    window.removeEventListener("keydown", cancel);
  };
}

export function AssetDetailPage({ user }: { user: User }) {
  const { t } = useTranslation("asset");
  const { symbol = "" } = useParams();
  const lastInitialScrollSymbolRef = useRef<string | null>(null);
  const [range, setRangeState] = useState<RangeKey>(() => user.defaultChartRange ?? "1d");
  const [editing, setEditing] = useState(false);
  const [draftPosition, setDraftPosition] = useState<PositionWithMarket | null>(null);
  const [openingPositionEditor, setOpeningPositionEditor] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareTargets, setCompareTargets] = useState<{ symbol: string; name: string }[]>([]);
  const { series: comparisonSeries, error: comparisonError, preparingSymbols } = useAssetComparisonSeries(compareTargets, range);
  const [toast, setToast] = useState<string | null>(null);
  const asset = useAsync(() => api.asset(symbol, range), `${symbol}:${range}`);
  const {
    chartPendingOpenConfirmation,
    chartPoints,
    chartRefreshing,
    displayChart
  } = useAssetChartLifecycle({
    asset: asset.data,
    loading: asset.loading,
    range,
    reload: asset.reload,
    symbol
  });
  const { toggleWatchlist, watchlisted } = useAssetWatchlist({
    initialWatchlisted: asset.data?.isInWatchlist,
    onError: setToast,
    quote: asset.data?.quote
  });

  useMarketEventReload({
    debounceMs: 300,
    eventTypes: ["asset-annex-updated", "market-snapshot-updated"],
    filterEvent: (payload) => {
      const key = symbol.toUpperCase();
      return payload.symbol?.toUpperCase() === key || payload.symbols?.some((item) => item.toUpperCase() === key) === true;
    },
    reload: asset.reload,
    reloadOnFocus: false,
    reloadOnVisibility: false
  });

  useLayoutEffect(() => {
    lastInitialScrollSymbolRef.current = null;
    return keepPageAtTopForInitialPaint(30);
  }, [symbol]);

  useLayoutEffect(() => {
    if (!asset.data || lastInitialScrollSymbolRef.current === symbol) return;
    lastInitialScrollSymbolRef.current = symbol;
    return keepPageAtTopForInitialPaint(180);
  }, [asset.data, symbol]);

  function addCompareTarget(target: { symbol: string; name: string }) {
    setCompareTargets((prev) => (prev.some((item) => item.symbol === target.symbol) ? prev : [...prev, target]));
  }

  function removeCompareTarget(targetSymbol: string) {
    setCompareTargets((prev) => prev.filter((t) => t.symbol !== targetSymbol));
  }

  function setRange(_source: string, nextRange: RangeKey) {
    setRangeState(nextRange);
  }

  useEffect(() => {
    const name = asset.data?.quote?.name;
    const title = name
      ? `${name.toUpperCase()} | PEA Portfolio`
      : symbol
        ? `${symbol.toUpperCase()} | PEA Portfolio`
        : "PEA Portfolio";

    document.title = title;

    return () => {
      document.title = "PEA Portfolio";
    };
  }, [asset.data?.quote?.name, symbol]);

  if (asset.loading && !asset.data) return <div className="card p-6">{t("loadingAsset", { symbol })}</div>;
  if (asset.error) return <div className="card border-coral p-6 text-coral">{asset.error}</div>;
  if (!asset.data) return null;

  const { quote, news, position, marketInfo, chart, marketSession } = asset.data;
  const userTimezone = normalizeTimeZone(asset.data.appTimezone);
  const marketUnavailable = quote.unavailable || position?.marketDataUnavailable;

  async function deletePosition() {
    const target = position ?? draftPosition;
    if (!target) return;
    await api.deletePosition(target.id);
    setDraftPosition(null);
    setToast(t("positionDeleted"));
    await asset.reload();
  }

  async function refreshAfterEdit() {
    await asset.reload();
    setDraftPosition(null);
    setToast(t("positionUpdated"));
    window.setTimeout(() => setToast(null), 3000);
  }

  async function openPositionEditor() {
    if (position) {
      setEditing(true);
      return;
    }
    setOpeningPositionEditor(true);
    setToast(null);
    try {
      const created = await api.ensurePosition({ symbol: quote.symbol, name: quote.name, currency: quote.currency });
      setDraftPosition(created);
      setEditing(true);
    } catch (error) {
      setToast(error instanceof Error ? error.message : t("addFailed"));
    } finally {
      setOpeningPositionEditor(false);
    }
  }

  async function closePositionEditor() {
    setEditing(false);
    if (!draftPosition) return;
    await api.deletePosition(draftPosition.id).catch(() => undefined);
    setDraftPosition(null);
    await asset.reload();
  }

  const dayChange = range === "1d" ? marketInfo?.regularMarketChange ?? quote.change : undefined;
  const dayChangePercent = range === "1d" ? marketInfo?.regularMarketChangePercent ?? quote.changePercent : undefined;
  const firstClose = range === "1d"
    ? marketInfo?.regularMarketPreviousClose ?? quote.previousClose ?? chart?.baselinePrice ?? chart?.prices[0]
    : chart?.prices[0];
  const rangeChange = dayChange ?? chart?.performanceEuro ?? 0;
  const rangeChangePercent = dayChangePercent ?? chart?.performancePercent ?? 0;
  const displayPrice = marketInfo?.regularMarketPrice ?? quote.price;

  return (
    <div className="space-y-6">
      <AssetDetailHeader
        displayPrice={displayPrice}
        marketUnavailable={marketUnavailable}
        onAdd={() => void openPositionEditor()}
        onEdit={() => setEditing(true)}
        onToggleWatchlist={() => void toggleWatchlist()}
        peaEligibilityStatus={asset.data.peaEligibility.status}
        positionExists={Boolean(position)}
        quote={quote}
        rangeChange={rangeChange}
        rangeChangePercent={rangeChangePercent}
        stale={asset.data.stale}
        watchlisted={watchlisted}
      />

      {toast && <div className="card border-mint/40 p-3 text-sm text-mint">{toast}</div>}
      {openingPositionEditor ? <div className="card border-mint/40 p-3 text-sm text-mint">{t("openingPositionEditor")}</div> : null}

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
        onCompare={() => setComparing(true)}
        onRangeChange={(nextRange) => setRange("user-click", nextRange)}
        preparingSymbols={preparingSymbols}
        quoteCurrency={quote.currency}
        range={range}
        stale={asset.data.stale}
        symbol={symbol}
        userTimezone={userTimezone}
      />

      <AssetOverviewSections asset={asset.data} currentPrice={displayPrice} firstPriceOfRange={firstClose} range={range} />

      <AssetCalendarEvents symbol={symbol} />

      {asset.data.analystConsensus ? (
        <AssetAnalystConsensus currency={quote.currency ?? "EUR"} data={asset.data.analystConsensus} />
      ) : null}

      {asset.data.isEtf && asset.data.fundDetails ? <AssetEtfFundDetails data={asset.data.fundDetails} /> : null}

      {user.assetNewsEnabled && <NewsArticleList articles={news} />}

      {editing && (position ?? draftPosition) && (
        <EditPositionModal
          onClose={() => void closePositionEditor()}
          onDeleted={() => void deletePosition()}
          onSaved={refreshAfterEdit}
          position={(position ?? draftPosition)!}
          startWithDraft={!position}
        />
      )}
      {comparing && (
        <CompareModal
          currentSymbol={symbol}
          localPeaSearchEnabled={user.localPeaSearchEnabled}
          onAdd={(target) => void addCompareTarget(target)}
          onClose={() => setComparing(false)}
          onRemove={removeCompareTarget}
          selected={compareTargets}
        />
      )}
    </div>
  );
}
