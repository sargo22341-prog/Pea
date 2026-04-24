import type { PortfolioDividendEvent } from "@pea/shared";
import { CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StaleBadge } from "../components/StaleBadge";
import { useAsync } from "../hooks/useAsync";
import { api } from "../lib/api";
import { money, shortDate } from "../lib/format";

export function DividendsPage() {
  const dividends = useAsync(() => api.portfolioDividends(), []);
  const [year, setYear] = useState("all");
  const [symbol, setSymbol] = useState("all");

  const data = dividends.data;
  const allEvents = [...(data?.upcoming ?? []), ...(data?.past ?? [])];
  const years = useMemo(() => [...new Set(allEvents.map((event) => String(event.year)))].sort((a, b) => b.localeCompare(a)), [allEvents]);
  const symbols = useMemo(() => [...new Set(allEvents.map((event) => event.symbol))].sort(), [allEvents]);
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
        <p className="muted">Versements réels disponibles et estimations basées sur l’année précédente.</p>
      </div>

      <section className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
        <div className="card p-4">
          <p className="muted">Total annuel estimé</p>
          <p className="mt-2 text-3xl font-bold text-mint">{money(data?.annualEstimatedTotal ?? 0, data?.currency ?? "EUR")}</p>
        </div>
        <label className="card p-4">
          <span className="muted mb-2 block">Année</span>
          <select className="input" onChange={(event) => setYear(event.target.value)} value={year}>
            <option value="all">Toutes</option>
            {years.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="card p-4">
          <span className="muted mb-2 block">Action/ETF</span>
          <select className="input" onChange={(event) => setSymbol(event.target.value)} value={symbol}>
            <option value="all">Tous</option>
            {symbols.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="card p-4">
        <h2 className="mb-4 font-semibold">Prévision mensuelle</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={data?.months ?? []}>
              <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 12 }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#10181f", border: "1px solid #263844", borderRadius: 8 }}
                formatter={(value) => money(Number(value), data?.currency ?? "EUR")}
              />
              <Bar dataKey="amount" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <DividendTable title="Dividendes à venir" events={filterEvents(data?.upcoming ?? [])} empty="Aucun dividende à venir détecté." />
      <DividendTable title="Dividendes passés" events={filterEvents(data?.past ?? [])} empty="Aucun dividende passé détecté." />
    </div>
  );
}

function DividendTable({ title, events, empty }: { title: string; events: PortfolioDividendEvent[]; empty: string }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line p-4">
        <CalendarClock className="text-sky" size={20} />
        <h2 className="font-semibold">{title}</h2>
      </div>
      <div className="divide-y divide-line">
        {events.length === 0 && <p className="p-4 text-slate-400">{empty}</p>}
        {events.map((event) => (
          <div className="grid gap-2 p-4 sm:grid-cols-[.7fr_.8fr_1fr_.8fr_.8fr_.8fr_.7fr]" key={`${title}-${event.symbol}-${event.date}-${event.totalAmount}`}>
            <div>
              <p className="font-semibold">{event.symbol}</p>
              <p className="muted truncate">{event.name}</p>
            </div>
            <p className="self-center">{shortDate(event.date)}</p>
            <p className="self-center">{event.year}</p>
            <p className="self-center">{money(event.amountPerShare, event.currency)}</p>
            <p className="self-center">{event.quantity}</p>
            <p className="self-center font-semibold">{money(event.totalAmount, event.currency)}</p>
            <p className="self-center text-right">
              <span className={event.status === "real" ? "rounded bg-mint/15 px-2 py-1 text-xs text-mint" : "rounded bg-amber/15 px-2 py-1 text-xs text-amber"}>
                {event.status === "real" ? "Réel" : "Estimé"}
              </span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
