/**
 * Role du fichier : afficher les top gainers et top losers Yahoo Finance sur
 * la page de recherche avec les etats loading, erreur et vide.
 */

import type { TopAndLosersResponse, TopMover } from "@pea/shared";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { formatSignedMoney, money, percent } from "../../lib/format";

export function TopMoversSection({
  data,
  error,
  loading
}: {
  data: TopAndLosersResponse | null;
  error: string | null;
  loading: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-xl font-bold">Mouvements du jour</h2>
        <p className="muted">Classements Yahoo Finance mis en cache pour la journee.</p>
      </div>

      {error && <div className="card border-coral p-4 text-sm text-coral">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <TopMoverCard items={data?.gainers ?? []} loading={loading} tone="up" title="Top gainers" />
        <TopMoverCard items={data?.losers ?? []} loading={loading} tone="down" title="Top losers" />
      </div>
    </section>
  );
}

/** Affiche un bloc de cinq valeurs pour un sens de mouvement donne. */
function TopMoverCard({
  items,
  loading,
  title,
  tone
}: {
  items: TopMover[];
  loading: boolean;
  title: string;
  tone: "up" | "down";
}) {
  const isUp = tone === "up";

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-4">
        <div className="flex items-center gap-2">
          {isUp ? <ArrowUpRight className="text-mint" size={18} /> : <ArrowDownRight className="text-coral" size={18} />}
          <h3 className="font-semibold">{title}</h3>
        </div>
      </div>

      {loading ? (
        <TopMoverSkeleton />
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-slate-400">Aucune action a afficher.</p>
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

/** Affiche une ligne d'action avec symbole, nom, prix, variation en valeur et pourcentage. */
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

/** Squelette compact utilise pendant le chargement des classements. */
function TopMoverSkeleton() {
  return (
    <div className="divide-y divide-line">
      {[0, 1, 2, 3, 4].map((item) => (
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
