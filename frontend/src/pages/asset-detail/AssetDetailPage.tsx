import type { RangeKey, User } from "@pea/shared";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AssetCalendarEvents } from "../../components/common/AssetCalendarEvents";
import { CompareModal } from "../../components/common/CompareModal";
import { NewsArticleList } from "../../components/common/NewsArticleList";
import { useAsync } from "../../hooks/useAsync";
import { useAssetComparisonSeries } from "../../hooks/useAssetComparisonSeries";
import { api } from "../../lib/api";
import { normalizeTimeZone } from "../../lib/timezone";
import { AddAssetPositionModal } from "./components/AddAssetPositionModal";
import { AssetAnalystConsensus } from "./components/AssetAnalystConsensus";
import { AssetDetailHeader } from "./components/AssetDetailHeader";
import { AssetEtfFundDetails } from "./components/AssetEtfFundDetails";
import { AssetHistorySection } from "./components/AssetHistorySection";
import { AssetOverviewSections } from "./components/AssetOverviewSections";
import { EditPositionModal } from "./components/EditPositionModal";
import { useAssetChartLifecycle } from "./hooks/useAssetChartLifecycle";
import { useAssetWatchlist } from "./hooks/useAssetWatchlist";

export function AssetDetailPage({ user }: { user: User }) {
  const { symbol = "" } = useParams();
  const navigate = useNavigate();
  const [range, setRangeState] = useState<RangeKey>(() => user.defaultChartRange ?? "1d");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
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

  if (asset.loading && !asset.data) return <div className="card p-6">Chargement de {symbol}...</div>;
  if (asset.error) return <div className="card border-coral p-6 text-coral">{asset.error}</div>;
  if (!asset.data) return null;

  const { quote, news, position, marketInfo, chart, marketSession } = asset.data;
  const userTimezone = normalizeTimeZone(asset.data.appTimezone);
  const marketUnavailable = quote.unavailable || position?.marketDataUnavailable;

  async function deletePosition() {
    if (!position) return;
    await api.deletePosition(position.id);
    setToast("Position supprimée");
    navigate("/search");
  }

  async function refreshAfterEdit() {
    await asset.reload();
    setToast("Position mise à jour");
    window.setTimeout(() => setToast(null), 3000);
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
        onAdd={() => setAdding(true)}
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

      {!asset.data.isEtf ? <AssetCalendarEvents symbol={symbol} /> : null}

      {!asset.data.isEtf && asset.data.analystConsensus ? (
        <AssetAnalystConsensus currency={quote.currency ?? "EUR"} data={asset.data.analystConsensus} />
      ) : null}

      {asset.data.isEtf && asset.data.fundDetails ? <AssetEtfFundDetails data={asset.data.fundDetails} /> : null}

      {user.assetNewsEnabled && <NewsArticleList articles={news} />}

      {editing && position && (
        <EditPositionModal
          onClose={() => setEditing(false)}
          onDeleted={() => void deletePosition()}
          onSaved={() => void refreshAfterEdit()}
          position={position}
        />
      )}
      {adding && (
        <AddAssetPositionModal
          currency={quote.currency}
          name={quote.name}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await asset.reload();
          }}
          symbol={quote.symbol}
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
