import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DividendAnnualEstimate } from "./components/DividendAnnualEstimate";
import { DividendGroupedList } from "./components/DividendGroupedList";
import { StaleBadge } from "../../components/common/StaleBadge";
import { useAsync } from "../../hooks/useAsync";
import { useMarketEventReload } from "../../hooks/useMarketEventReload";
import { getCurrentDividendYear, useDividendOverview } from "./hooks/useDividendOverview";
import { api } from "../../lib/api";

const currentYear = getCurrentDividendYear();

export function DividendsPage() {
  const { t } = useTranslation(["dashboard", "navigation"]);

  useEffect(() => {
    document.title = `${t("navigation:dividends")} | PEA Portfolio`;
    return () => {
      document.title = "PEA Portfolio";
    };
  }, [t]);

  const dividends = useAsync(() => api.portfolioDividends());
  const dividendsReload = dividends.reload;
  const [year, setYear] = useState(String(currentYear));

  useMarketEventReload({
    eventTypes: ["dividends-updated"],
    reload: dividendsReload
  });

  const data = dividends.data;
  const dividendOverview = useDividendOverview({
    currency: data?.currency,
    past: data?.past,
    upcoming: data?.upcoming,
    year
  });

  if (dividends.loading) return <div className="card p-6">{t("dashboard:dividendsPage.loading")}</div>;
  if (dividends.error) return <div className="card border-coral p-6 text-coral">{dividends.error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{t("navigation:dividends")}</h1>
          <StaleBadge show={data?.stale || dividendOverview.stale} />
        </div>
        <p className="muted">{t("dashboard:dividendsPage.subtitle")}</p>
      </div>

      <DividendAnnualEstimate
        currency={dividendOverview.currency}
        monthlyDividends={dividendOverview.monthlyDividends}
        onYearChange={setYear}
        total={dividendOverview.total}
        year={year}
        years={dividendOverview.years}
      />

      <DividendGroupedList currency={dividendOverview.currency} groups={dividendOverview.groups} total={dividendOverview.total} year={year} />
    </div>
  );
}
