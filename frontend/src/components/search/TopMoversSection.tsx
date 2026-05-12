/**
 * Role du fichier : afficher les listes Yahoo Finance de la page /search en
 * chargement lazy, seulement quand l'utilisateur clique sur une categorie.
 */

import type { MarketListId, MarketListResponse, TopMover } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight, BadgePercent, Flame, Gem, Landmark, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { formatSignedMoney, money, percent } from "../../lib/format";

type ButtonTone = "mint" | "coral" | "violet" | "amber" | "sky" | "teal" | "indigo";

const marketLists: Array<{
  id: MarketListId;
  name: string;
  tone: ButtonTone;
  icon: typeof ArrowUpRight;
}> = [
  { id: "day_gainers", name: "Top gainers", tone: "mint", icon: ArrowUpRight },
  { id: "day_losers", name: "Top losers", tone: "coral", icon: ArrowDownRight },
  { id: "trending_fr", name: "trendingSymbols", tone: "violet", icon: TrendingUp },
  { id: "high_dividend_yield", name: "dividend", tone: "amber", icon: BadgePercent },
  { id: "top_etfs_us", name: "ETFs", tone: "sky", icon: Landmark },
  { id: "undervalued_large_caps", name: "undervalued large", tone: "teal", icon: Gem },
  { id: "undervalued_growth_stocks", name: "undervalued growth", tone: "indigo", icon: Flame }
];

const toneClasses: Record<ButtonTone, { button: string; icon: string; active: string }> = {
  mint: { button: "border-mint/30 bg-mint/10 text-mint hover:border-mint", icon: "text-mint", active: "bg-mint text-ink border-mint" },
  coral: { button: "border-coral/30 bg-coral/10 text-coral hover:border-coral", icon: "text-coral", active: "bg-coral text-ink border-coral" },
  violet: { button: "border-violet-400/30 bg-violet-400/10 text-violet-300 hover:border-violet-300", icon: "text-violet-300", active: "bg-violet-400 text-ink border-violet-400" },
  amber: { button: "border-amber/30 bg-amber/10 text-amber hover:border-amber", icon: "text-amber", active: "bg-amber text-ink border-amber" },
  sky: { button: "border-sky/30 bg-sky/10 text-sky hover:border-sky", icon: "text-sky", active: "bg-sky text-ink border-sky" },
  teal: { button: "border-teal-300/30 bg-teal-300/10 text-teal-200 hover:border-teal-200", icon: "text-teal-200", active: "bg-teal-300 text-ink border-teal-300" },
  indigo: { button: "border-indigo-300/30 bg-indigo-300/10 text-indigo-200 hover:border-indigo-200", icon: "text-indigo-200", active: "bg-indigo-300 text-ink border-indigo-300" }
};

export function TopMoversSection() {
  const [selectedId, setSelectedId] = useState<MarketListId | null>(null);
  const [data, setData] = useState<MarketListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const selected = marketLists.find((list) => list.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api.marketList(selectedId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Erreur inconnue");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [selectedId]);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">Listes Yahoo Finance</h2>
        <p className="muted">Cliquez une categorie pour charger uniquement cette liste.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {marketLists.map((list) => (
          <MarketListButton
            active={selectedId === list.id}
            key={list.id}
            list={list}
            loading={loading && selectedId === list.id}
            onClick={() => setSelectedId(list.id)}
          />
        ))}
      </div>

      {error && <div className="card border-coral p-4 text-sm text-coral">{error}</div>}

      {!selected ? (
        <div className="card p-4 text-sm text-slate-400">Choisissez une liste a afficher.</div>
      ) : (
        <TopMoverCard icon={selected.icon} items={data?.id === selected.id ? data.items : []} loading={loading} tone={selected.tone} title={selected.name} />
      )}
    </section>
  );
}

function MarketListButton({
  active,
  list,
  loading,
  onClick
}: {
  active: boolean;
  list: (typeof marketLists)[number];
  loading: boolean;
  onClick: () => void;
}) {
  const Icon = list.icon;
  const tone = toneClasses[list.tone];

  return (
    <button className={`btn border ${active ? tone.active : tone.button}`} disabled={loading} onClick={onClick} type="button">
      <Icon size={17} />
      <span>{loading ? "Chargement..." : list.name}</span>
    </button>
  );
}

function TopMoverCard({
  icon: Icon,
  items,
  loading,
  title,
  tone
}: {
  icon: typeof ArrowUpRight;
  items: TopMover[];
  loading: boolean;
  title: string;
  tone: ButtonTone;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-4">
        <div className="flex items-center gap-2">
          <Icon className={toneClasses[tone].icon} size={18} />
          <h3 className="font-semibold">{title}</h3>
        </div>
      </div>

      {loading ? (
        <TopMoverSkeleton />
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-slate-400">Aucun actif a afficher.</p>
      ) : (
        <div className="divide-y divide-line">
          {items.map((item) => (
            <TopMoverRow item={item} key={item.symbol} />
          ))}
        </div>
      )}
    </div>
  );
}

function TopMoverRow({ item }: { item: TopMover }) {
  const currency = item.currency ?? "USD";
  const isPositive = item.change >= 0;

  return (
    <Link className="grid grid-cols-[1fr_auto] items-center gap-3 p-4 transition hover:bg-panel2/40" to={`/assets/${item.symbol}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="font-semibold">{item.symbol}</p>
          {item.shortName && <p className="truncate text-sm text-slate-400">{item.shortName}</p>}
        </div>
        <p className="mt-1 text-sm text-slate-300">{money(item.price, currency)}</p>
      </div>
      <div className="text-right">
        <p className={isPositive ? "font-semibold text-mint" : "font-semibold text-coral"}>{percent(item.changePercent)}</p>
        <p className={isPositive ? "text-sm text-mint" : "text-sm text-coral"}>{formatSignedMoney(item.change, currency)}</p>
      </div>
    </Link>
  );
}

function TopMoverSkeleton() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 10 }, (_, item) => (
        <div className="grid grid-cols-[1fr_auto] gap-3 p-4" key={item}>
          <div className="space-y-2">
            <div className="h-4 w-36 animate-pulse rounded bg-panel2" />
            <div className="h-3 w-20 animate-pulse rounded bg-panel2" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-16 animate-pulse rounded bg-panel2" />
            <div className="h-3 w-14 animate-pulse rounded bg-panel2" />
          </div>
        </div>
      ))}
    </div>
  );
}
