import { useEffect, useState } from "react";
import { DividendAnnualEstimate } from "../components/dividends/DividendAnnualEstimate";
import { DividendGroupedList } from "../components/dividends/DividendGroupedList";
import { StaleBadge } from "../components/common/StaleBadge";
import { useAsync } from "../hooks/useAsync";
import { getCurrentDividendYear, useDividendOverview } from "../hooks/useDividendOverview";
import { api } from "../lib/api";

const currentYear = getCurrentDividendYear();

export function DividendsPage() {

  useEffect(() => {
    document.title = "Dividendes | PEA Portfolio";
    return () => {
      document.title = "PEA Portfolio";
    };
  }, []);

  const dividends = useAsync(() => api.portfolioDividends(), []);
  const [year, setYear] = useState(String(currentYear));

  const data = dividends.data;
  const dividendOverview = useDividendOverview({
    currency: data?.currency,
    past: data?.past,
    upcoming: data?.upcoming,
    year
  });

  if (dividends.loading) return <div className="card p-6">Chargement des dividendes...</div>;
  if (dividends.error) return <div className="card border-coral p-6 text-coral">{dividends.error}</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Dividendes</h1>
          <StaleBadge show={data?.stale || dividendOverview.stale} />
        </div>
        <p className="muted">Vue annuelle regroupee par action, avec repartition trimestrielle.</p>
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
