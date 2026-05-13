import type { YahooUsageBucketDto, YahooUsageCallDto, YahooUsageRecentErrorDto, YahooUsageStatsDto } from "@pea/shared";
import { formatDateTime, formatMs, formatNumber } from "./yahooUsageUtils";

export function YahooUsageTopTable({ emptyLabel, onSelect, rows, title }: { emptyLabel: string; onSelect: (row: YahooUsageBucketDto) => void; rows: YahooUsageBucketDto[]; title: string }) {
  return (
    <section className="overflow-hidden rounded-md border border-line">
      <h3 className="border-b border-line bg-panel2/60 p-3 text-sm font-semibold text-slate-300">{title}</h3>
      {rows.length ? (
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-line">
            {rows.slice(0, 10).map((row) => (
              <tr className="cursor-pointer transition hover:bg-sky/5" key={row.key} onClick={() => onSelect(row)}>
                <td className="p-3 font-medium">{row.key}</td>
                <td className="p-3 text-right text-slate-300">{formatNumber(row.calls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="p-3 text-sm text-slate-400">{emptyLabel}</p>
      )}
    </section>
  );
}

export function YahooUsageRecentErrors({ data, onSelect }: { data: YahooUsageStatsDto; onSelect: (error: YahooUsageRecentErrorDto) => void }) {
  return (
    <section className="overflow-hidden rounded-md border border-line">
      <h3 className="border-b border-line bg-panel2/60 p-3 text-sm font-semibold text-slate-300">Erreurs recentes</h3>
      {data.recentErrors.length ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-line">
              {data.recentErrors.map((error) => (
                <tr key={error.id} className="cursor-pointer align-top transition hover:bg-coral/5" onClick={() => onSelect(error)}>
                  <td className="p-3">
                    <p className="font-medium">{error.method} {error.ticker ?? error.tickers[0] ?? ""}</p>
                    <p className="muted">{formatDateTime(error.createdAt)} - {formatMs(error.durationMs)}</p>
                    <p className="mt-1 text-slate-300">{error.errorMessage ?? "Erreur Yahoo"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-3 text-sm text-slate-400">Aucune erreur sur la periode.</p>
      )}
    </section>
  );
}

export function YahooUsageCallsTable({ calls, loading, onReset, selection }: { calls: YahooUsageCallDto[]; loading: boolean; onReset: () => void; selection: string }) {
  return (
    <section className="overflow-hidden rounded-md border border-line">
      <div className="flex flex-col gap-2 border-b border-line bg-panel2/60 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-300">Liste des appels</h3>
          <p className="muted">{selection}</p>
        </div>
        <button className="btn-ghost shrink-0" onClick={onReset} type="button">10 derniers appels</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-left text-sm">
          <thead className="bg-panel2/70 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Type</th>
              <th className="p-3">Tickers</th>
              <th className="p-3">Modules</th>
              <th className="p-3">Source</th>
              <th className="p-3">Range</th>
              <th className="p-3">Duree</th>
              <th className="p-3">Statut</th>
              <th className="p-3">Erreur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr><td className="p-3 text-slate-400" colSpan={9}>Chargement des appels...</td></tr>
            ) : calls.length ? calls.map((call) => (
              <tr className="align-top" key={call.id}>
                <td className="whitespace-nowrap p-3 text-slate-300">{formatDateTime(call.createdAt)}</td>
                <td className="p-3 font-medium">{call.method}</td>
                <td className="max-w-56 p-3 text-slate-300">{(call.tickers.length ? call.tickers : call.ticker ? [call.ticker] : []).join(", ") || "-"}</td>
                <td className="max-w-64 p-3 text-slate-300">{call.modules.join(", ") || "-"}</td>
                <td className="max-w-72 p-3 text-slate-300">{call.internalSource ?? "-"}</td>
                <td className="p-3 text-slate-300">{[call.range, call.interval].filter(Boolean).join(" / ") || "-"}</td>
                <td className="whitespace-nowrap p-3 text-slate-300">{formatMs(call.durationMs)}</td>
                <td className={call.success ? "p-3 text-mint" : "p-3 text-coral"}>{call.success ? "Succes" : "Erreur"}</td>
                <td className="max-w-80 p-3 text-slate-300">{call.errorMessage ?? "-"}</td>
              </tr>
            )) : (
              <tr><td className="p-3 text-slate-400" colSpan={9}>Aucun appel pour cette selection.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
