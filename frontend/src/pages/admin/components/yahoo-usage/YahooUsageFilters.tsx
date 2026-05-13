import type { PeriodKey, SuccessFilter } from "./yahooUsageTypes";
import { yahooUsageMethods } from "./yahooUsageTypes";

export function YahooUsageFilters(props: {
  customFrom: string;
  customTo: string;
  groupBy: "hour" | "day";
  method: string;
  moduleName: string;
  period: PeriodKey;
  source: string;
  success: SuccessFilter;
  ticker: string;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
  setGroupBy: (value: "hour" | "day") => void;
  setMethod: (value: string) => void;
  setModuleName: (value: string) => void;
  setPeriod: (value: PeriodKey) => void;
  setSource: (value: string) => void;
  setSuccess: (value: SuccessFilter) => void;
  setTicker: (value: string) => void;
}) {
  return (
    <div className="grid flex-1 gap-3 md:grid-cols-3 xl:grid-cols-7">
      <label className="space-y-1 text-sm">
        <span className="muted">Periode</span>
        <select className="input" value={props.period} onChange={(event) => props.setPeriod(event.target.value as PeriodKey)}>
          <option value="today">Aujourd'hui</option>
          <option value="24h">24h</option>
          <option value="7d">7 jours</option>
          <option value="30d">30 jours</option>
          <option value="custom">Personnalise</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Type</span>
        <select className="input" value={props.method} onChange={(event) => props.setMethod(event.target.value)}>
          <option value="">Tous</option>
          {yahooUsageMethods.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Module</span>
        <input className="input" onChange={(event) => props.setModuleName(event.target.value)} placeholder="price" value={props.moduleName} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Ticker</span>
        <input className="input uppercase" onChange={(event) => props.setTicker(event.target.value)} placeholder="AIR.PA" value={props.ticker} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Source</span>
        <input className="input" onChange={(event) => props.setSource(event.target.value)} placeholder="navigation ou tache" value={props.source} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Statut</span>
        <select className="input" value={props.success} onChange={(event) => props.setSuccess(event.target.value as SuccessFilter)}>
          <option value="all">Tous</option>
          <option value="success">Succes</option>
          <option value="error">Erreur</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">Groupement</span>
        <select className="input" value={props.groupBy} onChange={(event) => props.setGroupBy(event.target.value as "hour" | "day")}>
          <option value="hour">Heure</option>
          <option value="day">Jour</option>
        </select>
      </label>
      {props.period === "custom" && (
        <>
          <label className="space-y-1 text-sm">
            <span className="muted">Debut</span>
            <input className="input" onChange={(event) => props.setCustomFrom(event.target.value)} type="datetime-local" value={props.customFrom} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="muted">Fin</span>
            <input className="input" onChange={(event) => props.setCustomTo(event.target.value)} type="datetime-local" value={props.customTo} />
          </label>
        </>
      )}
    </div>
  );
}
