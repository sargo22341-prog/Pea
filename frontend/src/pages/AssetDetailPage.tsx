import type { AssetDetails, NewsArticle, PositionWithMarket, Quote, RangeKey, User } from "@pea/shared";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeEuro,
  BarChart3,
  Building2,
  CalendarDays,
  CircleDollarSign,
  Coins,
  Database,
  Gauge,
  Landmark,
  Newspaper,
  Pencil,
  Percent,
  Plus,
  Star,
  Timer,
  Trash2,
  Wallet
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AssetIcon } from "../components/AssetIcon";
import { FinancialComboChart } from "../components/charts/FinancialComboChart";
import { RangeSelector } from "../components/RangeSelector";
import { PeaBadge } from "../components/PeaBadge";
import { StaleBadge } from "../components/StaleBadge";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { formatChartDate, formatChartDateTime, formatChartTime, formatChartWeekTick, formatRangeLabel, money, percent, shortDate } from "../lib/format";

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

  const chartData = normalizeHistoryPoints(history);

  const validPoints = chartData.filter((p) => p.close != null);

  const firstClose = validPoints[0]?.close;
  const lastClose = validPoints[validPoints.length - 1]?.close;

  const rangeChange =
    firstClose != null && lastClose != null
      ? lastClose - firstClose
      : 0;

  const rangeChangePercent =
    firstClose != null && lastClose != null && firstClose !== 0
      ? ((lastClose - firstClose) / firstClose) * 100
      : 0;

  const positive = rangeChange >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;



  const isPositive =
    firstClose != null && lastClose != null
      ? lastClose >= firstClose
      : true;

  const chartColor = isPositive ? "#22c55e" : "#ef4444";
  const gradientId = isPositive ? "positiveGradient" : "negativeGradient";


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
          <div className="chart-fade h-80">
            <ResponsiveContainer>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="positiveGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>

                  <linearGradient id="negativeGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <XAxis
                  dataKey="date"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (range === "1d") return formatChartTime(String(value));
                    if (range === "1w" || range === "1m") return formatChartWeekTick(String(value));
                    return formatChartDate(String(value));
                  }}
                />

                <YAxis hide domain={["dataMin", "dataMax"]} />

                <Tooltip
                  contentStyle={{
                    background: "rgba(7, 16, 20, 0.72)",
                    border: "0",
                    borderRadius: 8,
                    backdropFilter: "blur(6px)",
                  }}
                  formatter={(value) =>
                    value == null ? "" : money(Number(value), quote.currency)
                  }
                  labelFormatter={(value) =>
                    range === "1d"
                      ? formatChartDateTime(String(value))
                      : range === "1w" || range === "1m"
                        ? formatChartDateTime(String(value))
                        : formatChartDate(String(value))
                  }
                />

                <Area
                  dataKey="close"
                  fill={`url(#${gradientId})`}
                  stroke={chartColor}
                  strokeWidth={3}
                  type="monotone"
                  connectNulls={false}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
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
            <PositionSection currentPrice={marketInfo?.regularMarketPrice ?? quote.price} firstPriceOfRange={firstClose} position={position} range={range} />
          ) : (
            <p className="text-slate-400">Aucune position détenue pour ce symbole.</p>
          )}
        </div>

        <div className="group p-5">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-slate-300">Informations marché</h2>
          <MarketInfoSection currency={quote.currency} hasKnownDividends={dividends.length > 0} marketInfo={marketInfo} quote={quote} />
        </div>
      </section>

      {!asset.data.isEtf && asset.data.financials && asset.data.financials.length > 0 ? (
        <section className="card min-w-0 p-4">
          <h2 className="mb-4 font-semibold">Revenue / Net Income / Marge</h2>
          <FinancialComboChart data={asset.data.financials} />
        </section>
      ) : null}

      {dividends.length > 0 ? (
        <section className="card overflow-hidden">
          <div className="border-b border-line p-4">
            <h2 className="font-semibold">Dividendes connus</h2>
          </div>
          <div className="divide-y divide-line">
            {dividends.slice(-20).reverse().map((event) => {
              const total = event.amount * (position?.quantity ?? 0);
              return (
                <div className="grid grid-cols-[1fr_auto] gap-2 p-4 sm:grid-cols-5" key={`${event.date}-${event.amount}`}>
                  <span className="font-semibold">{new Date(event.date).getFullYear()}</span>
                  <span>{shortDate(event.date)}</span>
                  <span>{money(event.amount, event.currency)} / action</span>
                  <span>{position ? money(total, event.currency) : "n/a"}</span>
                  <span className={event.status === "real" ? "text-mint" : "text-amber"}>{event.status === "real" ? "Réel" : "Estimé"}</span>
                </div>
              );
            })}
          </div>
        </section>
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
    </div>
  );
}

function NewsArticleList({ articles }: { articles: NewsArticle[] }) {
  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line p-4">
        <h2 className="font-semibold">Articles Yahoo Finance</h2>
      </div>
      <div className="space-y-3 p-4">
        {articles.length === 0 && <p className="text-slate-400">Aucun article lié à ce titre pour le moment.</p>}
        {articles.map((article) => (
          <ArticleBlock article={article} key={article.url} />
        ))}
      </div>
    </section>
  );
}

const clampTwoLines: CSSProperties = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflow: "hidden"
};

function ArticleBlock({ article }: { article: NewsArticle }) {
  const detail = article.description || article.publisher || formatArticleDate(article.publishedAt);
  const publishedDate = formatArticleDate(article.publishedAt);

  return (
    <a
      className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-md border border-line bg-ink p-3 transition hover:border-sky sm:grid-cols-[96px_minmax(0,1fr)]"
      href={article.url}
      rel="noreferrer"
      target="_blank"
    >
      {article.imageUrl ? (
        <img
          alt=""
          className="h-16 w-[72px] rounded-md object-cover sm:h-20 sm:w-24"
          loading="lazy"
          src={article.imageUrl}
        />
      ) : (
        <div className="flex h-16 w-[72px] items-center justify-center rounded-md border border-line bg-panel2 text-slate-500 sm:h-20 sm:w-24">
          <Newspaper size={24} />
        </div>
      )}
      <div className="min-w-0 self-center">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <p className="font-semibold text-slate-100" style={clampTwoLines}>
            {article.title}
          </p>
          {publishedDate && <span className="shrink-0 text-xs text-slate-500">{publishedDate}</span>}
        </div>
        <p className="mt-1 text-sm text-slate-400" style={clampTwoLines}>
          {detail || "Yahoo Finance"}
        </p>
      </div>
    </a>
  );
}

function formatArticleDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function AddAssetPositionModal({ symbol, name, currency, onClose, onSaved }: { symbol: string; name: string; currency: string; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [averageBuyPrice, setAverageBuyPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.addPosition({ symbol, name, quantity: Number(quantity), averageBuyPrice: Number(averageBuyPrice), currency });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
      <form className="card w-full max-w-md space-y-4 p-4" onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Ajouter {symbol}</h2>
          <button className="btn-ghost" onClick={onClose} type="button">Fermer</button>
        </div>
        <label className="block">
          <span className="muted mb-1 block">Quantite</span>
          <input className="input" min="0" onChange={(event) => setQuantity(event.target.value)} required step="any" type="number" value={quantity} />
        </label>
        <label className="block">
          <span className="muted mb-1 block">Prix d'achat moyen</span>
          <input className="input" min="0" onChange={(event) => setAverageBuyPrice(event.target.value)} required step="any" type="number" value={averageBuyPrice} />
        </label>
        {error && <p className="rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p>}
        <button className="btn-primary w-full" disabled={saving} type="submit">
          <Plus size={17} />
          {saving ? "Ajout..." : "Ajouter"}
        </button>
      </form>
    </div>
  );
}

function normalizeHistoryPoints<T extends { date: string; close: number }>(points: T[]) {
  const byDate = new Map<string, T>();
  for (const point of points) {
    if (!point.date || !Number.isFinite(new Date(point.date).getTime()) || !Number.isFinite(point.close)) continue;
    byDate.set(point.date, point);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function PositionSection({
  position,
  currentPrice,
  firstPriceOfRange,
  range
}: {
  position: PositionWithMarket;
  currentPrice: number;
  firstPriceOfRange?: number;
  range: RangeKey;
}) {
  const safeCurrentPrice = Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : position.currentPrice;
  const currentValue = position.quantity * safeCurrentPrice;
  const totalPerformanceValue = currentValue - position.costBasis;
  const totalPerformancePercent = position.costBasis ? (totalPerformanceValue / position.costBasis) * 100 : undefined;
  const periodPerformanceValue =
    firstPriceOfRange && firstPriceOfRange > 0 ? position.quantity * (safeCurrentPrice - firstPriceOfRange) : undefined;
  const periodPerformancePercent =
    firstPriceOfRange && firstPriceOfRange > 0 ? ((safeCurrentPrice - firstPriceOfRange) / firstPriceOfRange) * 100 : undefined;
  const valueRatio = Math.max(0, Math.min(100, position.costBasis > 0 ? (currentValue / Math.max(position.costBasis, currentValue)) * 100 : 0));
  const totalTone = toneFromNumber(totalPerformanceValue);
  const periodTone = toneFromNumber(periodPerformanceValue);
  const totalIsNegative = totalTone === "negative";
  const TotalTrendIcon = totalIsNegative ? ArrowDownRight : ArrowUpRight;
  const PeriodTrendIcon = periodTone === "negative" ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="space-y-4">
      <div
        className={`relative overflow-hidden rounded-[18px] border border-white/[0.06] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)] ${totalIsNegative
          ? "bg-[linear-gradient(135deg,rgba(251,113,133,0.16),rgba(0,0,0,0)),linear-gradient(135deg,rgba(7,16,20,0.96),rgba(35,13,20,0.9))]"
          : "bg-[linear-gradient(135deg,rgba(0,255,150,0.12),rgba(0,0,0,0)),linear-gradient(135deg,rgba(7,16,20,0.96),rgba(13,31,35,0.9))]"
          }`}
      >
        <div
          className={`absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full border ${totalIsNegative
            ? "border-coral/25 bg-coral/10 text-coral shadow-[0_0_24px_rgba(251,113,133,0.24)]"
            : "border-mint/25 bg-mint/10 text-mint shadow-[0_0_24px_rgba(74,222,128,0.22)]"
            }`}
        >
          <TotalTrendIcon size={24} />
        </div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Valeur actuelle</p>
        <div className="mt-3 pr-14">
          <p className="text-[32px] font-bold leading-tight text-white sm:text-4xl">{money(currentValue, position.currency)}</p>
          <p className={`mt-2 text-base font-semibold ${toneClass(totalTone)}`}>
            {formatSignedMoney(totalPerformanceValue, position.currency)}
            <span className="ml-2 text-sm">{totalPerformancePercent == null ? "(n/a)" : `(${percent(totalPerformancePercent)})`}</span>
          </p>
        </div>
        <div className="mt-6 border-t border-white/[0.05] pt-4">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>
              Valeur d'achat <span className="ml-1 text-slate-300">{money(position.costBasis, position.currency)}</span>
            </span>
            <span className="text-right">
              Valeur actuelle <span className="ml-1 text-slate-300">{money(currentValue, position.currency)}</span>
            </span>
          </div>
          <div className="relative mt-3 h-3 rounded-full bg-slate-950/80 shadow-[inset_0_1px_4px_rgba(0,0,0,0.55)]">
            <div
              className={`h-full rounded-full ${totalTone === "negative" ? "bg-gradient-to-r from-coral to-red-400" : "bg-gradient-to-r from-emerald-500 via-mint to-teal-300"} shadow-[0_0_18px_rgba(74,222,128,0.26)]`}
              style={{ width: `${valueRatio}%` }}
            />
            <div
              className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-slate-950 ${totalTone === "negative" ? "bg-coral shadow-[0_0_18px_rgba(251,113,133,0.48)]" : "bg-mint shadow-[0_0_18px_rgba(74,222,128,0.55)]"}`}
              style={{ left: `calc(${valueRatio}% - 0.5rem)` }}
            />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Info icon={<Coins size={18} />} iconTone="sky" label="Quantité" value={formatNumber(position.quantity)} />
        <Info icon={<CircleDollarSign size={18} />} iconTone="cyan" label="Prix moyen" value={money(position.averageBuyPrice, position.currency)} />
        <Info
          icon={<PeriodTrendIcon size={18} />}
          iconTone={periodTone === "negative" ? "red" : "green"}
          label={`Performance ${formatRangeLabel(range, { compact: true })}`}
          tone={periodTone}
          value={
            periodPerformanceValue == null || periodPerformancePercent == null ? (
              <span className="text-slate-500">n/a</span>
            ) : (
              <>
                <span>{formatSignedMoney(periodPerformanceValue, position.currency)}</span>
                <span className="ml-1">({percent(periodPerformancePercent)})</span>
              </>
            )
          }
        />
      </div>
    </div>
  );
}

function MarketInfoSection({
  marketInfo,
  quote,
  currency,
  hasKnownDividends
}: {
  marketInfo?: AssetDetails["marketInfo"];
  quote: Quote;
  currency: string;
  hasKnownDividends: boolean;
}) {
  const info = marketInfo ?? {};
  const displayCurrency = info.currency ?? currency;
  const dayChange = info.regularMarketChange ?? quote.change;
  const dayChangePercent = info.regularMarketChangePercent ?? quote.changePercent;
  const dayTone = toneFromNumber(dayChange);
  const DayTrendIcon = dayTone === "negative" ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-[16px] border border-white/[0.05] bg-slate-950/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:grid-cols-2 xl:grid-cols-3">
      <Info icon={<Gauge size={18} />} iconTone="amber" label="Marché" tone={marketStateTone(info.marketState ?? quote.marketState)} value={info.marketState ?? quote.marketState ?? "n/a"} variant="market" />
      <Info icon={<BadgeEuro size={18} />} iconTone="green" label="Dernier prix" value={formatMaybeMoney(info.regularMarketPrice ?? quote.price, displayCurrency)} variant="market" />
      <Info icon={<DayTrendIcon size={18} />} iconTone={dayTone === "negative" ? "red" : "green"} label="Variation jour" tone={dayTone} value={formatChange(dayChange, dayChangePercent, displayCurrency)} variant="market" />
      <Info icon={<Landmark size={18} />} iconTone="slate" label="Bourse" value={info.exchangeName ?? quote.exchange ?? "n/a"} variant="market" />
      <Info icon={<CircleDollarSign size={18} />} iconTone="cyan" label="Devise" value={info.currency ?? quote.currency ?? "n/a"} variant="market" />
      <Info icon={<BarChart3 size={18} />} iconTone="sky" label="Volume" value={formatMaybeInteger(info.regularMarketVolume)} variant="market" />
      <div className="sm:col-span-2 xl:col-span-2">
        <Info
          icon={<Timer size={18} />}
          iconTone="slate"
          label="Fourchette 52 semaines"
          value={
            <Range52Slider
              currency={displayCurrency}
              currentPrice={info.regularMarketPrice ?? quote.price}
              high52={info.fiftyTwoWeekHigh}
              low52={info.fiftyTwoWeekLow}
            />
          }
          variant="market"
        />
      </div>
      <Info icon={<Database size={18} />} iconTone="sky" label="Volume moyen 3M" value={formatMaybeInteger(info.averageDailyVolume3Month)} variant="market" />

      {hasKnownDividends && (
        <>
          <Info icon={<Wallet size={18} />} iconTone="green" label="Dividende annuel" value={formatMaybeMoney(info.dividendRate ?? quote.dividendRate, displayCurrency)} variant="market" />
          <Info icon={<Percent size={18} />} iconTone="green" label="Rendement dividende" tone={info.dividendYield == null && quote.dividendYield == null ? "muted" : undefined} value={formatMaybePercentYield(info.dividendYield ?? quote.dividendYield)} variant="market" />
          <Info icon={<CalendarDays size={18} />} iconTone="slate" label="Ex-date" value={formatMaybeDate(info.exDividendDate)} variant="market" />
        </>
      )}
    </div>
  );
}

type InfoTone = "positive" | "negative" | "muted" | "warning";
type IconTone = "green" | "red" | "amber" | "sky" | "cyan" | "slate";

function Range52Slider({
  low52,
  high52,
  currentPrice,
  currency
}: {
  low52?: number;
  high52?: number;
  currentPrice?: number;
  currency: string;
}) {
  if (
    low52 == null ||
    high52 == null ||
    currentPrice == null ||
    !Number.isFinite(low52) ||
    !Number.isFinite(high52) ||
    !Number.isFinite(currentPrice) ||
    high52 <= low52
  ) {
    return <span className="text-slate-500">n/a</span>;
  }

  const ratio = Math.max(0, Math.min(1, (currentPrice - low52) / (high52 - low52)));
  const percentPosition = ratio * 100;
  const rangeTone = percentPosition > 70 ? "green" : percentPosition < 30 ? "red" : "amber";
  const progressClass =
    rangeTone === "green"
      ? "bg-mint shadow-[0_0_14px_rgba(74,222,128,0.2)]"
      : rangeTone === "red"
        ? "bg-coral shadow-[0_0_14px_rgba(251,113,133,0.2)]"
        : "bg-amber shadow-[0_0_14px_rgba(251,191,36,0.18)]";
  const thumbClass =
    rangeTone === "green"
      ? "bg-mint shadow-[0_0_16px_rgba(74,222,128,0.5)]"
      : rangeTone === "red"
        ? "bg-coral shadow-[0_0_16px_rgba(251,113,133,0.48)]"
        : "bg-amber shadow-[0_0_16px_rgba(251,191,36,0.42)]";

  return (
    <div className="min-w-0 pt-1">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-slate-400">
        <span>{money(low52, currency)}</span>
        <span className="text-right">{money(high52, currency)}</span>
      </div>
      <div className="relative h-2 rounded-full bg-slate-950/80 shadow-[inset_0_1px_4px_rgba(0,0,0,0.55)]">
        <div className={`h-full rounded-full ${progressClass}`} style={{ width: `${percentPosition}%` }} />
        <div
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-slate-950 ${thumbClass}`}
          style={{ left: `${percentPosition}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-medium text-slate-400">
        Prix actuel <span className="text-slate-200">{money(currentPrice, currency)}</span>
      </p>
    </div>
  );
}

function Info({
  label,
  value,
  tone,
  icon,
  iconTone = "slate",
  variant = "tile"
}: {
  label: string;
  value: ReactNode;
  tone?: InfoTone;
  icon?: ReactNode;
  iconTone?: IconTone;
  variant?: "tile" | "market";
}) {
  const isMarket = variant === "market";
  return (
    <div
      className={
        isMarket
          ? "flex min-h-[92px] items-center gap-3 border-t border-white/[0.05] p-4 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 xl:[&:nth-child(3)]:border-t-0"
          : "rounded-[16px] border border-white/[0.05] bg-slate-950/45 p-4 shadow-[0_8px_22px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.035)]"
      }
    >
      {icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${iconToneClass(iconTone)}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`mt-1 break-words text-base font-semibold leading-snug ${toneClass(tone)}`}>{value}</p>
      </div>
    </div>
  );
}

function toneFromNumber(value?: number): InfoTone | undefined {
  if (value == null || !Number.isFinite(value)) return "muted";
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return undefined;
}

function toneClass(tone?: InfoTone) {
  if (tone === "positive") return "text-mint drop-shadow-[0_0_10px_rgba(74,222,128,0.18)]";
  if (tone === "negative") return "text-coral drop-shadow-[0_0_10px_rgba(251,113,133,0.16)]";
  if (tone === "warning") return "text-amber";
  if (tone === "muted") return "text-slate-500";
  return "";
}

function iconToneClass(tone: IconTone) {
  if (tone === "green") return "border-mint/25 bg-mint/10 text-mint shadow-[0_0_18px_rgba(74,222,128,0.18)]";
  if (tone === "red") return "border-coral/25 bg-coral/10 text-coral shadow-[0_0_18px_rgba(251,113,133,0.16)]";
  if (tone === "amber") return "border-amber/25 bg-amber/10 text-amber shadow-[0_0_18px_rgba(251,191,36,0.15)]";
  if (tone === "sky") return "border-sky/25 bg-sky/10 text-sky shadow-[0_0_18px_rgba(56,189,248,0.16)]";
  if (tone === "cyan") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.14)]";
  return "border-white/[0.08] bg-white/[0.04] text-slate-300";
}

function marketStateTone(value?: string): InfoTone {
  if (!value) return "muted";
  return value.toUpperCase() === "REGULAR" ? "positive" : "warning";
}

function formatSignedMoney(value: number, currency: string) {
  return `${value > 0 ? "+" : ""}${money(value, currency)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(value);
}

function formatMaybeInteger(value?: number) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

function formatMaybeMoney(value: number | undefined, currency: string) {
  return value == null || !Number.isFinite(value) ? "n/a" : money(value, currency);
}

function formatMaybePercentYield(value?: number) {
  return value == null || !Number.isFinite(value) ? "n/a" : percent(value * 100);
}

function formatChange(value: number | undefined, percentValue: number | undefined, currency: string) {
  if ((value == null || !Number.isFinite(value)) && (percentValue == null || !Number.isFinite(percentValue))) return "n/a";
  const amount = value == null || !Number.isFinite(value) ? "n/a" : formatSignedMoney(value, currency);
  const pct = percentValue == null || !Number.isFinite(percentValue) ? "n/a" : percent(percentValue);
  return `${amount} (${pct})`;
}

function formatRangeMoney(low: number | undefined, high: number | undefined, currency: string) {
  if ((low == null || !Number.isFinite(low)) && (high == null || !Number.isFinite(high))) return "n/a";
  return `${formatMaybeMoney(low, currency)} / ${formatMaybeMoney(high, currency)}`;
}

function formatMaybeDate(value?: string) {
  if (!value) return "n/a";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "n/a";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function EditPositionModal({
  position,
  onClose,
  onSaved,
  onDeleted
}: {
  position: PositionWithMarket;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [quantity, setQuantity] = useState(String(position.quantity));
  const [averageBuyPrice, setAverageBuyPrice] = useState(String(position.averageBuyPrice));
  const [currency, setCurrency] = useState(position.currency);
  const [notes, setNotes] = useState(position.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuantity(String(position.quantity));
    setAverageBuyPrice(String(position.averageBuyPrice));
    setCurrency(position.currency);
    setNotes(position.notes ?? "");
  }, [position]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.updatePosition(position.id, {
        quantity: Number(quantity),
        averageBuyPrice: Number(averageBuyPrice),
        currency,
        notes: notes || undefined
      });
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modification impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
      <form className="card w-full max-w-lg space-y-4 p-4" onSubmit={submit}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Éditer {position.symbol}</h2>
          <button className="btn-ghost" onClick={onClose} type="button">Fermer</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="muted mb-1 block">Quantité</span>
            <input className="input" min="0" onChange={(event) => setQuantity(event.target.value)} required step="any" type="number" value={quantity} />
          </label>
          <label>
            <span className="muted mb-1 block">Prix d’achat moyen</span>
            <input className="input" min="0" onChange={(event) => setAverageBuyPrice(event.target.value)} required step="any" type="number" value={averageBuyPrice} />
          </label>
          <label>
            <span className="muted mb-1 block">Devise</span>
            <select className="input" onChange={(event) => setCurrency(event.target.value)} value={currency}>
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
              <option>CHF</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="muted mb-1 block">Notes</span>
          <textarea className="input min-h-24" onChange={(event) => setNotes(event.target.value)} value={notes} />
        </label>

        {error && <p className="rounded-md border border-coral/40 bg-coral/10 p-3 text-sm text-coral">{error}</p>}

        <div className="rounded-md border border-coral/40 bg-coral/10 p-3">
          <p className="mb-3 text-sm font-semibold text-coral">Zone danger</p>
          <button className="btn-ghost text-coral" onClick={onDeleted} type="button">
            <Trash2 size={17} />
            Supprimer l’action
          </button>
        </div>

        <button className="btn-primary w-full" disabled={saving} type="submit">
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
