import type { PortfolioDividendEvent } from "@pea/shared";
import { CalendarClock, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AssetIcon } from "../components/AssetIcon";
import { StaleBadge } from "../components/StaleBadge";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { money } from "../lib/format";

type SortKey = "date" | "amountPerShare" | "quantity" | "totalAmount";
type SortDirection = "asc" | "desc";
type PageSize = 10 | 20 | 50 | 100 | "all";

const pageSizes: PageSize[] = [10, 20, 50, 100, "all"];
const sortLabels: Record<SortKey, string> = {
  date: "Date",
  amountPerShare: "Montant/action",
  quantity: "Quantite",
  totalAmount: "Total"
};

export function DividendsPage() {
  const dividends = useAsync(() => api.portfolioDividends(), []);
  const [year, setYear] = useState("all");
  const [symbol, setSymbol] = useState("all");

  const data = dividends.data;
  const allEvents = useMemo(() => [...(data?.upcoming ?? []), ...(data?.past ?? [])], [data?.past, data?.upcoming]);
  const years = useMemo(() => [...new Set(allEvents.map((event) => String(event.year)))].sort((a, b) => b.localeCompare(a)), [allEvents]);
  const assets = useMemo(
    () =>
      [...new Map(allEvents.map((event) => [event.symbol, { symbol: event.symbol, name: event.name }])).values()].sort((a, b) =>
        a.name.localeCompare(b.name, "fr")
      ),
    [allEvents]
  );

  const filterEvents = (events: PortfolioDividendEvent[]) =>
    events.filter((event) => (year === "all" || String(event.year) === year) && (symbol === "all" || event.symbol === symbol));

  if (dividends.loading) return <div className="card p-6">Chargement des dividendes...</div>;
  if (dividends.error) return <div className="card border-coral p-6 text-coral">{dividends.error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Dividendes</h1>
          <StaleBadge show={data?.stale || allEvents.some((event) => event.stale)} />
        </div>
        <p className="muted">Versements reels disponibles et estimations basees sur l'annee precedente.</p>
      </div>

      <section className="card p-4">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="muted">Total annuel estime</p>
            <p className="mt-1 text-3xl font-bold text-mint">{money(data?.annualEstimatedTotal ?? 0, data?.currency ?? "EUR")}</p>
          </div>
          <h2 className="font-semibold">Prevision mensuelle</h2>
        </div>
        <div className="h-72 min-w-0">
          <ResponsiveContainer>
            <BarChart data={data?.months ?? []}>
              <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#10181f", border: "1px solid #263844", borderRadius: 8 }}
                formatter={(value) => money(Number(value), data?.currency ?? "EUR")}
              />
              <Bar dataKey="amount" fill="#22c55e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="muted mb-2 block">Annee</span>
            <select className="input" onChange={(event) => setYear(event.target.value)} value={year}>
              <option value="all">Toutes</option>
              {years.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="muted mb-2 block">Action/ETF</span>
            <select className="input" onChange={(event) => setSymbol(event.target.value)} value={symbol}>
              <option value="all">Tous</option>
              {assets.map((item) => (
                <option key={item.symbol} value={item.symbol}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <DividendTable title="Dividendes a venir" events={filterEvents(data?.upcoming ?? [])} empty="Aucun dividende a venir detecte." />
      <DividendTable title="Dividendes passes" events={filterEvents(data?.past ?? [])} empty="Aucun dividende passe detecte." />
    </div>
  );
}

function DividendTable({ title, events, empty }: { title: string; events: PortfolioDividendEvent[]; empty: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>(title.includes("passes") ? "desc" : "asc");
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [page, setPage] = useState(1);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "date") return a.date.localeCompare(b.date) * direction;
      return (a[sortKey] - b[sortKey]) * direction;
    });
  }, [events, sortDirection, sortKey]);

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(sortedEvents.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleEvents = pageSize === "all" ? sortedEvents : sortedEvents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function updateSort(nextKey: SortKey) {
    setPage(1);
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "date" && title.includes("passes") ? "desc" : "asc");
  }

  function updatePageSize(value: string) {
    setPage(1);
    setPageSize(value === "all" ? "all" : (Number(value) as PageSize));
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="text-mint" size={20} />
          <h2 className="font-semibold">{title}</h2>
        </div>
        <div className="grid gap-2 sm:grid-cols-[180px_130px]">
          <label className="sr-only" htmlFor={`${title}-sort`}>Tri</label>
          <select
            className="input"
            id={`${title}-sort`}
            onChange={(event) => {
              const [key, direction] = event.target.value.split(":") as [SortKey, SortDirection];
              setSortKey(key);
              setSortDirection(direction);
              setPage(1);
            }}
            value={`${sortKey}:${sortDirection}`}
          >
            {Object.entries(sortLabels).flatMap(([key, label]) => [
              <option key={`${key}:asc`} value={`${key}:asc`}>{label} croissant</option>,
              <option key={`${key}:desc`} value={`${key}:desc`}>{label} decroissant</option>
            ])}
          </select>
          <select className="input" onChange={(event) => updatePageSize(event.target.value)} value={String(pageSize)}>
            {pageSizes.map((size) => (
              <option key={String(size)} value={String(size)}>{size === "all" ? "All" : size}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="hidden grid-cols-[1.4fr_.95fr_.85fr_.7fr_.85fr_.75fr] gap-3 border-b border-line bg-ink px-4 py-3 text-sm text-slate-400 md:grid">
        <span>Nom</span>
        <SortButton active={sortKey === "date"} direction={sortDirection} label="Date" onClick={() => updateSort("date")} />
        <SortButton active={sortKey === "amountPerShare"} direction={sortDirection} label="Montant/action" onClick={() => updateSort("amountPerShare")} />
        <SortButton active={sortKey === "quantity"} direction={sortDirection} label="Quantite" onClick={() => updateSort("quantity")} />
        <SortButton active={sortKey === "totalAmount"} direction={sortDirection} label="Total" onClick={() => updateSort("totalAmount")} />
        <span>Statut</span>
      </div>

      <div className="divide-y divide-line">
        {visibleEvents.length === 0 && <p className="p-4 text-slate-400">{empty}</p>}
        {visibleEvents.map((event) => (
          <DividendRow event={event} key={`${title}-${event.symbol}-${event.date}-${event.totalAmount}`} />
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-line p-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>Page {currentPage} / {totalPages}</span>
        <div className="flex items-center gap-2">
          <button className="btn-ghost" disabled={currentPage <= 1 || pageSize === "all"} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">
            <ChevronLeft size={16} />
          </button>
          <button className="btn-ghost" disabled={currentPage >= totalPages || pageSize === "all"} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} type="button">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function DividendRow({ event }: { event: PortfolioDividendEvent }) {
  return (
    <div className="grid min-w-0 gap-3 p-4 md:grid-cols-[1.4fr_.95fr_.85fr_.7fr_.85fr_.75fr] md:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <AssetIcon className="h-10 w-10" symbol={event.symbol} />
        <div className="min-w-0">
          <p className="truncate font-semibold uppercase">{event.name}</p>
          <p className="mt-1 whitespace-nowrap text-sm text-slate-400 md:hidden">{fullDate(event.date)}</p>
        </div>
      </div>
      <Cell label="Date" value={fullDate(event.date)} className="hidden md:block" />
      <Cell label="Montant/action" value={money(event.amountPerShare, event.currency)} />
      <Cell label="Quantite" value={new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(event.quantity)} />
      <Cell label="Total" value={money(event.totalAmount, event.currency)} strong />
      <div className="min-w-0">
        <p className="md:hidden text-xs text-slate-500">Statut</p>
        <span className={event.status === "real" ? "text-mint" : "text-amber"}>{event.status === "real" ? "Reel" : "Estime"}</span>
      </div>
    </div>
  );
}

function Cell({ label, value, strong, className = "" }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="md:hidden text-xs text-slate-500">{label}</p>
      <p className={`truncate ${strong ? "font-semibold" : ""}`}>{value}</p>
    </div>
  );
}

function SortButton({
  active,
  direction,
  label,
  onClick
}: {
  active: boolean;
  direction: SortDirection;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={`text-left transition hover:text-mint ${active ? "text-mint" : ""}`} onClick={onClick} type="button">
      {label}{active ? ` ${direction === "asc" ? "↑" : "↓"}` : ""}
    </button>
  );
}

function fullDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(date).replace(".", "");
}
