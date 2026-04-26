import type { RangeKey, User } from "@pea/shared";
import {
  ArrowDownRight,
  ArrowUpRight,
  Pencil,
  Plus,
  Star
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AddAssetPositionModal } from "../components/AddAssetPositionModal";
import { AssetMarketInfo } from "../components/AssetMarketInfo";
import { AssetIcon } from "../components/AssetIcon";
import { AssetPositionSummary } from "../components/AssetPositionSummary";
import { DividendLineChartSection } from "../components/charts/DividendLineChartSection";
import { FinancialComboChart } from "../components/charts/FinancialComboChart";
import { PriceHistoryChart } from "../components/charts/PriceHistoryChart";
import { EditPositionModal } from "../components/EditPositionModal";
import { NewsArticleList } from "../components/NewsArticleList";
import { PeaBadge } from "../components/PeaBadge";
import { RangeSelector } from "../components/RangeSelector";
import { StaleBadge } from "../components/StaleBadge";
import { useAsync } from "../hooks/useAsync";
import { usePriceHistoryChart } from "../hooks/usePriceHistoryChart";
import { api } from "../lib/api";
import { money, percent } from "../lib/format";

export function AssetDetailPage({ user }: { user: User }) {
  const { symbol = "" } = useParams();
  const navigate = useNavigate();
  const [range, setRangeState] = useState<RangeKey>(() => {
    const initialRange = user.defaultChartRange ?? "1d";
    return initialRange;
  });
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const asset = useAsync(() => api.asset(symbol, range), [symbol, range]);
  const historyPoints = (asset.data?.history ?? []).map((point) => ({ date: point.date, value: point.close }));
  const historyChart = usePriceHistoryChart(historyPoints, range);

  function setRange(source: string, nextRange: RangeKey) {
    setRangeState((previousRange) => {
      void source;
      void previousRange;
      return nextRange;
    });
  }

  useEffect(() => {
    if (asset.data) setWatchlisted(Boolean(asset.data.isInWatchlist));
  }, [asset.data]);

  if (asset.loading && !asset.data) return <div className="card p-6">Chargement de {symbol}...</div>;
  if (asset.error) return <div className="card border-coral p-6 text-coral">{asset.error}</div>;
  if (!asset.data) return null;

  const { quote, history, dividends, news, position, marketInfo } = asset.data;
  const marketUnavailable = quote.unavailable || position?.marketDataUnavailable;

  async function deletePosition() {
    if (!position) return;
    if (!window.confirm(`Supprimer la position ${position.symbol} ?`)) return;
    await api.deletePosition(position.id);
    setToast("Position supprimée");
    navigate("/portfolio");
  }

  async function refreshAfterEdit() {
    await asset.reload();
    setToast("Position mise à jour");
    window.setTimeout(() => setToast(null), 3000);
  }


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

  const { chartData, firstValue: firstClose, change: rangeChange, changePercent: rangeChangePercent, isPositive: positive } = historyChart;

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
            <p className="text-3xl font-bold">{money(quote.price, quote.currency)}</p>
            <p className={`mt-1 flex items-center gap-1 font-semibold sm:justify-end ${positive ? "text-mint" : "text-coral"}`}>
              <Icon size={18} />
              {money(rangeChange, quote.currency)} ({percent(rangeChangePercent)})
            </p>
            {position && (
              <button className="btn-ghost mt-3" onClick={() => setEditing(true)} type="button">
                <Pencil size={17} />
                Éditer
              </button>
            )}
            {!position && (
              <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
                <button className="btn-primary" onClick={() => setAdding(true)} type="button">
                  <Plus size={17} />
                  Ajouter
                </button>
                <button className={watchlisted ? "btn bg-amber text-ink" : "btn-ghost"} onClick={() => void toggleWatchlist()} type="button">
                  <Star fill={watchlisted ? "currentColor" : "none"} size={17} />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {toast && <div className="card border-mint/40 p-3 text-sm text-mint">{toast}</div>}

      <section className="card p-0 sm:p-4">
        <div className="mb-3 flex flex-col justify-between gap-4 px-2 sm:mb-4 sm:flex-row sm:items-center sm:px-0">
          <h2 className="font-semibold">Historique</h2>
          <RangeSelector onChange={(nextRange) => setRange("user-click", nextRange)} value={range} />
        </div>
        {asset.loading ? (
          <div className="flex h-80 items-center justify-center text-sm text-slate-400">Chargement du graphique...</div>
        ) : history.length > 1 ? (
          <PriceHistoryChart currency={quote.currency} data={chartData} heightClassName="h-80" range={range} />
        ) : (
          <div className="flex h-40 items-center justify-center rounded-md border border-line bg-ink text-sm text-slate-400">
            {range === "1d"
              ? "Données intraday indisponibles"
              : "Données de marché indisponibles"}
          </div>
        )}
        {range === "1d" && (history.length === 0 || asset.data.stale) && (
          <p className="mt-3 text-xs text-slate-500">Donnees intraday indisponibles ou servies depuis le cache.</p>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="group p-5">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-300">Ma position</h2>
          {position ? (
            <AssetPositionSummary currentPrice={marketInfo?.regularMarketPrice ?? quote.price} firstPriceOfRange={firstClose} position={position} range={range} />
          ) : (
            <p className="text-slate-400">Aucune position détenue pour ce symbole.</p>
          )}
        </div>

        <div className="group p-5">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-300">Informations marché</h2>
          <AssetMarketInfo currency={quote.currency} hasKnownDividends={dividends.length > 0} marketInfo={marketInfo} quote={quote} />
        </div>
      </section>

      {!asset.data.isEtf && asset.data.financials && asset.data.financials.length > 0 ? (
        <section className="card min-w-0 p-4">
          <h2 className="mb-4 font-semibold">Revenue / Net Income / Marge</h2>
          <FinancialComboChart data={asset.data.financials} />
        </section>
      ) : null}

      <DividendLineChartSection
        averageBuyPrice={position?.averageBuyPrice}
        currentPrice={marketInfo?.regularMarketPrice ?? quote.price}
        dividends={dividends}
      />

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
    </div>
  );
}

