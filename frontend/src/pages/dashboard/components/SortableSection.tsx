import type { SortDirection } from "@pea/shared";
import { ArrowDownNarrowWide, ArrowUpNarrowWide } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type SortOption<TKey extends string> = {
  direction: SortDirection;
  key: TKey;
  label: string;
};

export function SortableSection<TKey extends string>({
  activeDirection,
  activeKey,
  as = "div",
  children,
  className,
  options,
  title,
  titleClassName,
  onSortChange
}: {
  activeDirection: SortDirection;
  activeKey: TKey;
  as?: "div" | "section";
  children: ReactNode;
  className?: string;
  options: Array<SortOption<TKey>>;
  title: ReactNode;
  titleClassName?: string;
  onSortChange: (key: TKey, direction: SortDirection) => void;
}) {
  const { t } = useTranslation(["dashboard"]);
  const [sortOpen, setSortOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const activeSort = options.find((option) => option.key === activeKey && option.direction === activeDirection) ?? options[0];
  const SortIcon = activeDirection === "asc" ? ArrowUpNarrowWide : ArrowDownNarrowWide;
  const Root = as;

  useEffect(() => {
    if (!sortOpen) return undefined;
    function closeOnOutsideClick(event: MouseEvent) {
      if (!sortMenuRef.current?.contains(event.target as Node)) setSortOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [sortOpen]);

  function updateSort(option: SortOption<TKey>) {
    onSortChange(option.key, option.direction);
    setSortOpen(false);
  }

  return (
    <Root className={className}>
      <div className="flex items-center justify-between gap-3 border-b border-line p-4">
        <div className={titleClassName}>
          {title}
          <p className="mt-1 truncate text-xs text-slate-400">{t("sort.active", { label: activeSort.label, ns: "dashboard" })}</p>
        </div>

        <div className="relative shrink-0" ref={sortMenuRef}>
          <button
            aria-expanded={sortOpen}
            aria-haspopup="menu"
            className="btn-ghost px-2.5 sm:px-3"
            onClick={() => setSortOpen((current) => !current)}
            title={activeDirection === "asc" ? t("sort.ascending", { ns: "dashboard" }) : t("sort.descending", { ns: "dashboard" })}
            type="button"
          >
            <SortIcon size={17} />
            <span className="hidden sm:inline">{t("sort.sort", { ns: "dashboard" })}</span>
          </button>

          {sortOpen && (
            <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-md border border-line bg-panel shadow-glow" role="menu">
              {options.map((option) => {
                const active = option.key === activeKey && option.direction === activeDirection;
                return (
                  <button
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-panel2 ${active ? "bg-sky/15 text-sky" : "text-slate-100"}`}
                    key={`${option.key}:${option.direction}`}
                    onClick={() => updateSort(option)}
                    role="menuitemradio"
                    type="button"
                  >
                    <span>{option.label}</span>
                    {active && <span className="text-xs font-semibold">{t("sort.activeBadge", { defaultValue: "actif", ns: "dashboard" })}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {children}
    </Root>
  );
}
