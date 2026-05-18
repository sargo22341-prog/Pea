import type { PeriodKey, SuccessFilter } from "./yahooUsageTypes";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["common"]);
  return (
    <div className="grid flex-1 gap-3 md:grid-cols-3 xl:grid-cols-7">
      <label className="space-y-1 text-sm">
        <span className="muted">{t("admin.yahooUsage.period", { ns: "common" })}</span>
        <select className="input" value={props.period} onChange={(event) => props.setPeriod(event.target.value as PeriodKey)}>
          <option value="today">{t("admin.yahooUsage.today", { ns: "common" })}</option>
          <option value="24h">24h</option>
          <option value="7d">{t("admin.yahooUsage.sevenDays", { ns: "common" })}</option>
          <option value="30d">{t("admin.yahooUsage.thirtyDays", { ns: "common" })}</option>
          <option value="custom">{t("admin.yahooUsage.custom", { ns: "common" })}</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">{t("admin.yahooUsage.type", { ns: "common" })}</span>
        <select className="input" value={props.method} onChange={(event) => props.setMethod(event.target.value)}>
          <option value="">{t("admin.yahooUsage.all", { ns: "common" })}</option>
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
        <input className="input" onChange={(event) => props.setSource(event.target.value)} placeholder={t("admin.yahooUsage.sourcePlaceholder", { ns: "common" })} value={props.source} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">{t("admin.yahooUsage.status", { ns: "common" })}</span>
        <select className="input" value={props.success} onChange={(event) => props.setSuccess(event.target.value as SuccessFilter)}>
          <option value="all">{t("admin.yahooUsage.all", { ns: "common" })}</option>
          <option value="success">{t("admin.yahooUsage.success", { ns: "common" })}</option>
          <option value="error">{t("admin.yahooUsage.error", { ns: "common" })}</option>
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="muted">{t("admin.yahooUsage.groupBy", { ns: "common" })}</span>
        <select className="input" value={props.groupBy} onChange={(event) => props.setGroupBy(event.target.value as "hour" | "day")}>
          <option value="hour">{t("admin.yahooUsage.hour", { ns: "common" })}</option>
          <option value="day">{t("admin.yahooUsage.day", { ns: "common" })}</option>
        </select>
      </label>
      {props.period === "custom" && (
        <>
          <label className="space-y-1 text-sm">
            <span className="muted">{t("admin.yahooUsage.start", { ns: "common" })}</span>
            <input className="input" onChange={(event) => props.setCustomFrom(event.target.value)} type="datetime-local" value={props.customFrom} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="muted">{t("admin.yahooUsage.end", { ns: "common" })}</span>
            <input className="input" onChange={(event) => props.setCustomTo(event.target.value)} type="datetime-local" value={props.customTo} />
          </label>
        </>
      )}
    </div>
  );
}
