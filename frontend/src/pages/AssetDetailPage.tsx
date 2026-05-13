import type { RangeKey, User } from "@pea/shared";
import { GitCompare } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AddAssetPositionModal } from "./asset-detail/components/AddAssetPositionModal";
import { AssetDetailHeader } from "./asset-detail/components/AssetDetailHeader";
import { AssetMarketInfo } from "./asset-detail/components/AssetMarketInfo";
import { AssetPositionSummary } from "./asset-detail/components/AssetPositionSummary";
import { DividendLineChartSection } from "../components/charts/DividendLineChartSection";
import { FinancialComboChart } from "../components/charts/FinancialComboChart";
import { ComparisonChart, PriceHistoryChart } from "../components/charts/PriceHistoryChart";
import { CompareModal } from "../components/common/CompareModal";
import { EditPositionModal } from "./asset-detail/components/EditPositionModal";
import { NewsArticleList } from "../components/common/NewsArticleList";
import { AssetAnalystConsensus } from "./asset-detail/components/AssetAnalystConsensus";
import { AssetEtfFundDetails } from "./asset-detail/components/AssetEtfFundDetails";
import { AssetCalendarEvents } from "../components/common/AssetCalendarEvents";
import { RangeSelector } from "../components/common/RangeSelector";
import { useAsync } from "../hooks/useAsync";
import { useAssetComparisonSeries } from "../hooks/useAssetComparisonSeries";
import { useAssetChartLifecycle } from "./asset-detail/hooks/useAssetChartLifecycle";
import { useAssetWatchlist } from "./asset-detail/hooks/useAssetWatchlist";
import { api } from "../lib/api";
import { formatMarketSessionHours, normalizeTimeZone } from "../lib/timezone";

export function AssetDetailPage({ user }: { user: User }) {
  const { symbol = "" } = useParams();
  const navigate = useNavigate();
  const [range, setRangeState] = useState<RangeKey>(() => {
    const initialRange = user.defaultChartRange ?? "1d";
    return initialRange;
  });
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [compareTargets, setCompareTargets] = useState<{ symbol: string; name: string }[]>([]);
  const { series: comparisonSeries, error: comparisonError, preparingSymbols } = useAssetComparisonSeries(compareTargets, range);
  const [toast, setToast] = useState<string | null>(null);
  const asset = useAsync(() => api.asset(symbol, range), [symbol, range]);
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

  /**
   * Met à jour la range affichée pour le chart d'actif.
   *
   * @param source Origine de l'action, conservée pour instrumentation future.
   * @param nextRange Nouvelle range demandée.
   * @returns Rien.
   */
  function setRange(source: string, nextRange: RangeKey) {
    void source;
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

  const { quote, dividends, news, position, marketInfo, chart, marketSession } = asset.data;
  const userTimezone = normalizeTimeZone(asset.data.appTimezone);
  const marketUnavailable = quote.unavailable || position?.marketDataUnavailable;




  /**
   * Supprime la position détenue puis redirige vers la recherche.
   *
   * @returns Promesse résolue après suppression.
   */
  async function deletePosition() {
    if (!position) return;
    await api.deletePosition(position.id);
    setToast("Position supprimée");
    navigate("/search");
  }

  /**
   * Recharge les données après modification d'une position.
   *
   * @returns Promesse résolue après rafraîchissement.
   */
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

      <section className={`card p-0 sm:p-4 ${chartRefreshing ? "stale-refreshing" : ""}`}>
        <div className="mb-3 flex flex-col justify-between gap-4 px-2 sm:mb-4 sm:flex-row sm:items-center sm:px-0">
          <h2 className="font-semibold">Historique</h2>
          <div className="flex items-center justify-end gap-2">
            <button className={compareTargets.length > 0 ? "btn bg-blue-600 text-white" : "btn-ghost"} onClick={() => setComparing(true)} type="button">
              <GitCompare size={17} />
              {compareTargets.length > 0 ? compareTargets.length : "Comparer"}
            </button>
            <RangeSelector onChange={(nextRange) => setRange("user-click", nextRange)} value={range} />
          </div>
        </div>
        {asset.loading && chartPoints.length <= 1 ? (
          <div className="flex h-80 items-center justify-center text-sm text-slate-400">Chargement du graphique...</div>
        ) : chartPoints.length > 1 ? (
          comparisonSeries.length > 0 ? (
            <ComparisonChart
              comparisonSeries={comparisonSeries}
              data={chartPoints}
              heightClassName="h-80"
              mainSymbol={symbol}
              marketSession={marketSession ?? displayChart?.marketSession}
              range={range}
              userTimezone={userTimezone}
            />
          ) : (
            <PriceHistoryChart
              baselineDatetime={displayChart?.baselineDatetime}
              baselinePrice={displayChart?.baselinePrice}
              currency={quote.currency}
              data={chartPoints}
              heightClassName="h-80"
              hideXAxisTicks
              marketSession={marketSession ?? displayChart?.marketSession}
              range={range}
              userTimezone={userTimezone}
            />
          )
        ) : chart?.isPreparing ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-line bg-ink text-sm text-amber">
            Donnees en cours de preparation
          </div>
        ) : chartPendingOpenConfirmation ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-line bg-ink px-4 text-center text-sm text-slate-400">
            Donnees intraday pas encore disponibles, marche pas encore confirme ouvert
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center rounded-md border border-line bg-ink text-sm text-slate-400">
            {range === "1d"
              ? "Données intraday indisponibles"
              : "Données de marché indisponibles"}
          </div>
        )}
        {range === "1d" && (chartPoints.length === 0 || asset.data.stale) && (
          <p className="mt-3 text-xs text-slate-500">Donnees intraday indisponibles ou servies depuis le cache.</p>
        )}
        {compareTargets.length > 0 && preparingSymbols.length > 0 && (
          <p className="mt-3 text-xs text-amber">
            Preparation des donnees de comparaison : {preparingSymbols.join(", ")}
          </p>
        )}
        {compareTargets.length > 0 && comparisonError && preparingSymbols.length === 0 && (
          <p className="mt-3 text-xs text-slate-400">{comparisonError}</p>
        )}
        {range === "1d" && marketSession && (marketSession.timezone !== userTimezone || marketSession.sessions.length > 1) && (
          <p className="mt-3 text-xs text-slate-400">
            Horaires du marche : {marketSession.city} {formatMarketSessionHours(marketSession.sessions)}, heure locale du marche
          </p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="group p-5">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-300">Ma position</h2>
          {position ? (
            <AssetPositionSummary
              currentPrice={marketInfo?.regularMarketPrice ?? quote.price}
              firstPriceOfRange={firstClose}
              position={position}
              range={range}
              rangePerformance={asset.data.positionRangePerformance}
              stats={asset.data.positionStats}
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

      {!asset.data.isEtf ? (
        <AssetCalendarEvents symbol={symbol} />
      ) : null}

      {!asset.data.isEtf && asset.data.analystConsensus ? (
        <AssetAnalystConsensus currency={quote.currency ?? "EUR"} data={asset.data.analystConsensus} />
      ) : null}
      <div className="flex flex-col lg:flex-row gap-4">
        {!asset.data.isEtf && asset.data.financials && asset.data.financials.length > 0 ? (
          <section className="card min-w-0 p-4 flex-1">
            <h2 className="mb-4 font-semibold">Revenue / Net Income / Marge</h2>
            <FinancialComboChart data={asset.data.financials} />
          </section>
        ) : null}

        <div className="min-w-0 flex-1">
          {!asset.data.isEtf && dividends && dividends.length > 0 ? (
            <section className="card overflow-hidden">
              <h2 className="mb-4 font-semibold">Dividende</h2>
              <DividendLineChartSection
                averageBuyPrice={position?.averageBuyPrice}
                currentPrice={marketInfo?.regularMarketPrice ?? quote.price}
                dividends={dividends}
                marketInfo={marketInfo}
              />
            </section>
          ) : null}
        </div>
      </div>

      {asset.data.isEtf && asset.data.fundDetails ? (
        <AssetEtfFundDetails data={asset.data.fundDetails} />
      ) : null}


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

/**
 * Convertit le DTO compact backend en points compatibles avec le composant chart.
 *
 * @param chart DTO optionnel renvoyé par le backend.
 * @returns Points date/value sans calcul financier côté React.
 */
