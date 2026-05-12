/**
 * Role du fichier : afficher les listes Yahoo Finance de la page /search en
 * chargement lazy, seulement quand l'utilisateur clique sur une categorie.
 */

import type { MarketListId, MarketListResponse, TopMover } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight, BadgePercent, Flame, Gem, Landmark, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import { formatSignedMoney, money, percent } from "../../../lib/format";

type ButtonTone = "mint" | "coral" | "violet" | "amber" | "sky" | "teal" | "fuchsia";

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
  { id: "undervalued_large_caps", name: "Grandes caps sous-valorisees", tone: "teal", icon: Gem },
  { id: "undervalued_growth_stocks", name: "Croissance sous-valorisee", tone: "fuchsia", icon: Flame }
];

const toneClasses: Record<ButtonTone, { button: string; icon: string; active: string }> = {
  mint: {
    button: "border-emerald-200/35 bg-gradient-to-r from-emerald-500 via-green-500 to-lime-400 shadow-[0_0_20px_rgba(34,197,94,.34)] hover:border-emerald-100/75 hover:shadow-[0_0_30px_rgba(34,197,94,.62)]",
    icon: "text-mint",
    active: "border-emerald-50/85 shadow-[0_0_34px_rgba(34,197,94,.74),inset_0_0_18px_rgba(255,255,255,.14)]"
  },
  coral: {
    button: "border-rose-200/35 bg-gradient-to-r from-rose-500 via-red-500 to-orange-400 shadow-[0_0_20px_rgba(244,63,94,.34)] hover:border-rose-100/75 hover:shadow-[0_0_30px_rgba(244,63,94,.62)]",
    icon: "text-coral",
    active: "border-rose-50/85 shadow-[0_0_34px_rgba(244,63,94,.74),inset_0_0_18px_rgba(255,255,255,.14)]"
  },
  violet: {
    button: "border-violet-200/35 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 shadow-[0_0_20px_rgba(139,92,246,.34)] hover:border-violet-100/75 hover:shadow-[0_0_30px_rgba(139,92,246,.62)]",
    icon: "text-violet-300",
    active: "border-violet-50/85 shadow-[0_0_34px_rgba(139,92,246,.74),inset_0_0_18px_rgba(255,255,255,.14)]"
  },
  amber: {
    button: "border-amber-100/40 bg-gradient-to-r from-amber-400 via-orange-500 to-yellow-400 shadow-[0_0_20px_rgba(245,158,11,.34)] hover:border-amber-50/80 hover:shadow-[0_0_30px_rgba(245,158,11,.62)]",
    icon: "text-amber",
    active: "border-amber-50/90 shadow-[0_0_34px_rgba(245,158,11,.74),inset_0_0_18px_rgba(255,255,255,.14)]"
  },
  sky: {
    button: "border-sky-100/35 bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 shadow-[0_0_20px_rgba(14,165,233,.34)] hover:border-sky-50/75 hover:shadow-[0_0_30px_rgba(14,165,233,.62)]",
    icon: "text-sky",
    active: "border-sky-50/85 shadow-[0_0_34px_rgba(14,165,233,.74),inset_0_0_18px_rgba(255,255,255,.14)]"
  },
  teal: {
    button: "border-teal-100/35 bg-gradient-to-r from-teal-400 via-cyan-500 to-sky-400 shadow-[0_0_20px_rgba(20,184,166,.34)] hover:border-teal-50/75 hover:shadow-[0_0_30px_rgba(20,184,166,.62)]",
    icon: "text-teal-200",
    active: "border-teal-50/85 shadow-[0_0_34px_rgba(20,184,166,.74),inset_0_0_18px_rgba(255,255,255,.14)]"
  },
  fuchsia: {
    button: "border-pink-100/35 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500 shadow-[0_0_20px_rgba(236,72,153,.34)] hover:border-pink-50/75 hover:shadow-[0_0_30px_rgba(236,72,153,.62)]",
    icon: "text-pink-300",
    active: "border-pink-50/85 shadow-[0_0_34px_rgba(236,72,153,.74),inset_0_0_18px_rgba(255,255,255,.14)]"
  }
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

      <div className="flex flex-wrap gap-3">
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
    <button
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-bold text-white shadow-lg transition duration-200 ease-out hover:-translate-y-0.5 hover:scale-[1.02] hover:brightness-110 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:hover:brightness-100 sm:h-10 sm:px-4 sm:text-sm ${tone.button} ${active ? tone.active : ""}`}
      disabled={loading}
      onClick={onClick}
      type="button"
    >
      <Icon className="shrink-0 text-white" size={16} strokeWidth={2.5} />
      <span className="whitespace-nowrap">{loading ? "Chargement..." : list.name}</span>
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
