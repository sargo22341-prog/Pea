/**
 * Rôle du fichier : afficher le détail d'un actif avec des DTO backend prêts à
 * l'affichage pour limiter les calculs React.
 */

import type { AssetChartDto, RangeKey, User } from "@pea/shared";
import {
  ArrowDownRight,
  ArrowUpRight,
  GitCompare,
  Pencil,
  Plus,
  Star
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AddAssetPositionModal } from "../components/asset-detail/AddAssetPositionModal";
import { AssetMarketInfo } from "../components/asset-detail/AssetMarketInfo";
import { AssetIcon } from "../components/common/AssetIcon";
import { AssetPositionSummary } from "../components/asset-detail/AssetPositionSummary";
import { DividendLineChartSection } from "../components/charts/DividendLineChartSection";
import { FinancialComboChart } from "../components/charts/FinancialComboChart";
import { ComparisonChart, PriceHistoryChart } from "../components/charts/PriceHistoryChart";
import { CompareModal } from "../components/common/CompareModal";
import { EditPositionModal } from "../components/asset-detail/EditPositionModal";
import { NewsArticleList } from "../components/common/NewsArticleList";
import { PeaBadge } from "../components/asset-detail/PeaBadge";
import { AssetAnalystConsensus } from "../components/asset-detail/AssetAnalystConsensus";
import { AssetEtfFundDetails } from "../components/asset-detail/AssetEtfFundDetails";
import { AssetCalendarEvents } from "../components/common/AssetCalendarEvents";
import { RangeSelector } from "../components/common/RangeSelector";
import { StaleBadge } from "../components/common/StaleBadge";
import { useAsync } from "../hooks/useAsync";
import { useAssetComparisonSeries } from "../hooks/useAssetComparisonSeries";
import { api } from "../lib/api";
import { isDataConstructionActive, notifyDataConstructionChanged } from "../lib/dataConstruction";
import { money, percent } from "../lib/format";
import { formatMarketSessionHours, normalizeTimeZone } from "../lib/timezone";

const lazyChartRetryCooldownMs = 60_000;
const lazyChartRefreshTimeoutMs = 45_000;

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
  const { series: comparisonSeries, loading: comparisonLoading } = useAssetComparisonSeries(compareTargets, range);
  const [watchlisted, setWatchlisted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [chartRefreshing, setChartRefreshing] = useState(false);
  const lazyChartGuard = useRef({
    key: "",
    requestedForCacheVersion: "",
    lastRefreshRequestedAt: 0,
    refreshInProgress: false,
    suppressUntil: 0,
    timeout: undefined as number | undefined
  });
  const asset = useAsync(() => api.asset(symbol, range), [symbol, range]);
  const assetReload = asset.reload;
  const assetChartPreparing = Boolean(asset.data?.chart?.isPreparing);
  const chartPoints = chartDtoToPoints(asset.data?.chart);

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
    if (asset.data) {
      setWatchlisted(Boolean(asset.data.isInWatchlist));
    }
  }, [asset.data]);

  useEffect(() => {
    if (!assetChartPreparing) return;

    notifyDataConstructionChanged();

    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      const status = await api.dataConstructionStatus().catch(() => null);

      if (cancelled) return;

      if (!isDataConstructionActive(status)) {
        await assetReload();
        return;
      }

      timer = window.setTimeout(poll, 2000);
    }

    timer = window.setTimeout(poll, 2000);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [assetChartPreparing, assetReload]);

  useEffect(() => {
    if (range !== "1d" || !asset.data?.chart) return;
    const key = `${symbol.toUpperCase()}:1d`;
    const cacheVersion = chartCacheVersion(asset.data.chart);
    const guard = lazyChartGuard.current;
    const now = Date.now();

    if (guard.key !== key) {
      if (guard.timeout) window.clearTimeout(guard.timeout);
      lazyChartGuard.current = {
        key,
        requestedForCacheVersion: "",
        lastRefreshRequestedAt: 0,
        refreshInProgress: false,
        suppressUntil: 0,
        timeout: undefined
      };
    }

    const current = lazyChartGuard.current;
    if (current.refreshInProgress || now < current.suppressUntil) return;
    if (current.requestedForCacheVersion === cacheVersion && now - current.lastRefreshRequestedAt < lazyChartRetryCooldownMs) return;

    current.requestedForCacheVersion = cacheVersion;
    current.lastRefreshRequestedAt = now;

    api.requestChartRefresh({ scope: "asset", symbol, range: "1d" })
      .then((result) => {
        if (result.status === "started" || result.status === "in-progress") {
          current.refreshInProgress = true;
          setChartRefreshing(true);
          if (current.timeout) window.clearTimeout(current.timeout);
          current.timeout = window.setTimeout(() => {
            current.refreshInProgress = false;
            current.timeout = undefined;
            setChartRefreshing(false);
          }, lazyChartRefreshTimeoutMs);
          return;
        }

        current.refreshInProgress = false;
        current.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (current.timeout) window.clearTimeout(current.timeout);
        current.timeout = undefined;
        setChartRefreshing(false);
      })
      .catch(() => {
        current.refreshInProgress = false;
        current.lastRefreshRequestedAt = Date.now();
        setChartRefreshing(false);
      });
  }, [asset.data?.chart, range, symbol]);

  useEffect(() => {
    function onMarketEvent(event: Event) {
      const payload = (event as CustomEvent<{ type?: string; symbol?: string; range?: string }>).detail;
      if (payload?.symbol?.toUpperCase() !== symbol.toUpperCase() || payload.range !== "1d") return;
      if (payload.type === "asset-chart-refresh-started") setChartRefreshing(true);
      if (payload.type === "asset-chart-updated") {
        const guard = lazyChartGuard.current;
        guard.refreshInProgress = false;
        guard.suppressUntil = Date.now() + lazyChartRetryCooldownMs;
        if (guard.timeout) window.clearTimeout(guard.timeout);
        guard.timeout = undefined;
        setChartRefreshing(false);
        void assetReload();
      }
    }
    window.addEventListener("pea:market-event", onMarketEvent);
    return () => window.removeEventListener("pea:market-event", onMarketEvent);
  }, [assetReload, symbol]);

  useEffect(() => {
    return () => {
      const timeout = lazyChartGuard.current.timeout;
      if (timeout) window.clearTimeout(timeout);
    };
  }, []);

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


  /**
   * Ajoute ou retire l'actif de la liste de suivi.
   *
   * @returns Promesse résolue après synchronisation avec l'API.
   */
  async function toggleWatchlist() {
    const next = !watchlisted;
    setWatchlisted(next);
    try {
      if (next) {
        await api.addWatchlist({ symbol: quote.symbol, name: quote.name, exchange: quote.exchange, currency: quote.currency });
      } else {
        await api.removeWatchlist(quote.symbol);
      }
    } catch (error) {
      setWatchlisted(!next);
      setToast(error instanceof Error ? error.message : "Liste de suivi impossible");
    }
  }

  const dayChange = range === "1d" ? marketInfo?.regularMarketChange ?? quote.change : undefined;
  const dayChangePercent = range === "1d" ? marketInfo?.regularMarketChangePercent ?? quote.changePercent : undefined;
  const firstClose = range === "1d"
    ? marketInfo?.regularMarketPreviousClose ?? quote.previousClose ?? chart?.baselinePrice ?? chart?.prices[0]
    : chart?.prices[0];
  const rangeChange = dayChange ?? chart?.performanceEuro ?? 0;
  const rangeChangePercent = dayChangePercent ?? chart?.performancePercent ?? 0;
  const positive = rangeChange >= 0;
  const displayPrice = marketInfo?.regularMarketPrice ?? quote.price;

  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <AssetIcon className="h-14 w-14" symbol={quote.symbol} />
            <div className="min-w-0">
              <p className="muted">{quote.symbol}</p>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold">{quote.name}</h1>
                <PeaBadge status={asset.data.peaEligibility.status} />
                <StaleBadge
                  show={asset.data.stale || quote.stale || marketUnavailable}
                  label={marketUnavailable ? "Données de marché indisponibles" : "Données différées"}
                />
              </div>
              <p className="mt-2 text-slate-400">
                {quote.exchange ?? "Marché n/a"} · {quote.currency}
              </p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-3xl font-bold">{money(displayPrice, quote.currency)}</p>
            <p className={`mt-1 flex items-center gap-1 font-semibold sm:justify-end ${positive ? "text-mint" : "text-coral"}`}>
              <Icon size={18} />
              {money(rangeChange, quote.currency)} ({percent(rangeChangePercent)})
            </p>
            <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
              {position ? (
                <button className="btn-ghost" onClick={() => setEditing(true)} type="button">
                  <Pencil size={17} />
                  Éditer
                </button>
              ) : (
                <>
                  <button className="btn-primary" onClick={() => setAdding(true)} type="button">
                    <Plus size={17} />
                    Ajouter
                  </button>
                  <button className={watchlisted ? "btn bg-amber text-ink" : "btn-ghost"} onClick={() => void toggleWatchlist()} type="button">
                    <Star fill={watchlisted ? "currentColor" : "none"} size={17} />
                  </button>
                </>
              )}
              <button className={compareTargets.length > 0 ? "btn bg-blue-600 text-white" : "btn-ghost"} onClick={() => setComparing(true)} type="button">
                <GitCompare size={17} />
                Comparer
              </button>
            </div>
          </div>
        </div>
      </section>

      {toast && <div className="card border-mint/40 p-3 text-sm text-mint">{toast}</div>}

      <section className={`card p-0 sm:p-4 ${chartRefreshing ? "stale-refreshing" : ""}`}>
        <div className="mb-3 flex flex-col justify-between gap-4 px-2 sm:mb-4 sm:flex-row sm:items-center sm:px-0">
          <h2 className="font-semibold">Historique</h2>
          <RangeSelector onChange={(nextRange) => setRange("user-click", nextRange)} value={range} />
        </div>
        {asset.loading || (compareTargets.length > 0 && (comparisonLoading || chart?.isPreparing)) ? (
          <div className="flex h-80 items-center justify-center text-sm text-slate-400">Chargement du graphique...</div>
        ) : chartPoints.length > 1 ? (
          comparisonSeries.length > 0 ? (
            <ComparisonChart
              comparisonSeries={comparisonSeries}
              data={chartPoints}
              heightClassName="h-80"
              mainSymbol={symbol}
              marketSession={marketSession ?? chart?.marketSession}
              range={range}
              userTimezone={userTimezone}
            />
          ) : (
            <PriceHistoryChart
              baselineDatetime={chart?.baselineDatetime}
              baselinePrice={chart?.baselinePrice}
              currency={quote.currency}
              data={chartPoints}
              heightClassName="h-80"
              hideXAxisTicks
              marketSession={marketSession ?? chart?.marketSession}
              range={range}
              userTimezone={userTimezone}
            />
          )
        ) : chart?.isPreparing ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-line bg-ink text-sm text-amber">
            Donnees en cours de preparation
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
            <AssetPositionSummary currentPrice={marketInfo?.regularMarketPrice ?? quote.price} firstPriceOfRange={firstClose} position={position} range={range} stats={asset.data.positionStats} />
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

        <div className="flex-1">
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
function chartDtoToPoints(chart?: AssetChartDto) {
  if (!chart) return [];
  return chart.timestamps.map((timestamp, index) => ({
    date: new Date(timestamp).toISOString(),
    value: chart.prices[index] ?? null
  }));
}

function chartCacheVersion(chart: AssetChartDto) {
  const lastTimestamp = chart.timestamps[chart.timestamps.length - 1] ?? "none";
  return `${chart.timestamps.length}:${lastTimestamp}:${chart.baselineDatetime ?? ""}`;
}

