import type { ScreenerResponse, ScreenerSortKey } from "@pea/shared";
import { ArrowDown, ArrowUp, Columns3 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AssetIcon } from "../../../components/common/AssetIcon";
import { MOTION, staggerDelay } from "../../../components/common/motion";
import { readLocalPreference, writeLocalPreference } from "../../../lib/local-preference";
import { columnSortKey, DEFAULT_COLUMNS, formatScreenerCell, SCREENER_COLUMNS, type ScreenerColumn } from "../screener-config";

const COLUMNS_KEY = "screener.columns";

function readColumns(): ScreenerColumn[] {
  const stored = readLocalPreference(COLUMNS_KEY);
  if (stored === null) return [...DEFAULT_COLUMNS];
  return SCREENER_COLUMNS.filter((column) => stored.split(",").includes(column));
}

function SortHeader({ label, sortKey, sort, direction, onSort }: { label: string; sortKey?: ScreenerSortKey | undefined; sort: ScreenerSortKey; direction: "asc" | "desc"; onSort: (key: ScreenerSortKey) => void }) {
  if (!sortKey) return <th className="px-3 py-2 font-medium" scope="col">{label}</th>;
  const active = sortKey === sort;
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-2 font-medium" scope="col">
      <button className={`inline-flex items-center gap-1 ${active ? "text-sky" : "hover:text-slate-200"}`} onClick={() => { onSort(sortKey); }} type="button">
        {label}
        {active && <Arrow aria-hidden size={12} />}
      </button>
    </th>
  );
}

/** Résultats triables ; colonnes additionnelles choisies dans le menu et mémorisées. */
export function ScreenerResultsTable({ response, sort, direction, onSort }: { response: ScreenerResponse; sort: ScreenerSortKey; direction: "asc" | "desc"; onSort: (key: ScreenerSortKey) => void }) {
  const { t } = useTranslation("screener");
  const [columns, setColumns] = useState(readColumns);
  const [menuOpen, setMenuOpen] = useState(false);

  function toggleColumn(column: ScreenerColumn) {
    const next = SCREENER_COLUMNS.filter((known) => (known === column ? !columns.includes(column) : columns.includes(known)));
    setColumns(next);
    writeLocalPreference(COLUMNS_KEY, next.join(","));
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <p className="text-sm text-slate-300">
          <span className={`inline-block font-semibold text-slate-100 ${MOTION.pop}`} key={response.total}>{response.total}</span> {t("results.count", { count: response.total })}
          {response.truncated && <span className="text-slate-500"> · {t("results.truncated", { count: response.rows.length })}</span>}
        </p>
        <div className="relative">
          <button aria-expanded={menuOpen} className="btn-ghost h-8 px-3 text-xs" onClick={() => { setMenuOpen(!menuOpen); }} type="button">
            <Columns3 size={15} />
            {t("results.columns")}
          </button>
          {menuOpen && (
            <div className={`absolute right-0 z-20 mt-1 w-56 space-y-1 rounded-md border border-line bg-panel p-2 shadow-lg ${MOTION.menu}`}>
              {SCREENER_COLUMNS.map((column) => (
                <label className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-panel2" key={column}>
                  <input checked={columns.includes(column)} onChange={() => { toggleColumn(column); }} type="checkbox" />
                  {t(`columns.${column}`)}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
      {response.rows.length === 0 ? (
        <p className="p-4 text-sm text-slate-400">{t("results.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <SortHeader direction={direction} label={t("columns.name")} onSort={onSort} sort={sort} sortKey="name" />
                {columns.map((column) => (
                  <SortHeader direction={direction} key={column} label={t(`columns.${column}`)} onSort={onSort} sort={sort} sortKey={columnSortKey(column)} />
                ))}
              </tr>
            </thead>
            <tbody>
              {response.rows.map((row, index) => (
                <tr className={`border-t border-line/60 ${MOTION.rise}`} key={row.symbol} style={{ animationDelay: staggerDelay(index) }}>
                  <th className="px-3 py-2 text-left font-normal" scope="row">
                    <Link className="flex min-w-0 items-center gap-2 hover:text-sky" to={`/assets/${encodeURIComponent(row.symbol)}`}>
                      <AssetIcon className="h-6 w-6" symbol={row.symbol} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-100">{row.name}</span>
                        <span className="block text-xs text-slate-500">{row.symbol}{row.peaEligible ? ` · ${t("results.pea")}` : ""}</span>
                      </span>
                    </Link>
                  </th>
                  {columns.map((column) => <td className="px-3 py-2 tabular-nums text-slate-200" key={column}>{formatScreenerCell(column, row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
