import type { CashLedgerDto, FullHistoryBlocker } from "@pea/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "../../../../components/common/feedback/ConfirmDialog";
import { usePrivacy } from "../../../../contexts/privacy-context";
import { useAsync } from "../../../../hooks/useAsync";
import { api } from "../../../../lib/api";
import { formatStatementPeriod, formatStatementReference } from "../../../../lib/cash/ledger-entry";
import { formatMaybeDate } from "../../../../lib/format";
import { FullHistoryComparison } from "./FullHistoryComparison";

/** Mois (`2026-03`), ligne de relevé (`2026-03#4`) ou opération de l'application, lisible. */
function formatReference(reference: string) {
  if (/^\d{4}-\d{2}$/.test(reference)) return formatStatementPeriod(reference);
  if (reference.includes("#")) return formatStatementReference(reference);
  return reference;
}

function BlockerItem({ blocker }: { blocker: FullHistoryBlocker }) {
  const { t } = useTranslation("cash");
  const shown = blocker.references.map(formatReference).join(", ");
  return (
    <li>
      {t(`fullHistory.blockers.${blocker.code}`, { count: blocker.count })}
      {shown ? <span className="muted block text-xs">{blocker.count > blocker.references.length ? t("fullHistory.someReferences", { references: shown }) : shown}</span> : null}
    </li>
  );
}

/**
 * Passage en historique complet dans « Mon PEA » : quand les relevés espèces couvrent tout depuis
 * l'ouverture, l'état initial est remplacé par les opérations réelles. Action explicite et
 * confirmée ; sinon, ce qui manque est listé. `version` change à chaque écriture du journal.
 */
export function FullHistoryCard({ version, onCompleted }: { version: string; onCompleted: (ledger: CashLedgerDto) => void }) {
  const { t } = useTranslation("cash");
  const prive = usePrivacy();
  const preview = useAsync((signal) => api.fullHistoryPreview(signal), version, { cacheKey: "cash-full-history" });
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (preview.error) return <section className="card border-coral p-4 text-coral">{preview.error}</section>;
  if (!preview.data) return null;
  const { eligible, blockers, after, firstPeriod, lastPeriod, referenceAt } = preview.data;

  async function complete() {
    setConfirming(false);
    setSaving(true);
    setError(null);
    try {
      onCompleted(await api.completeFullHistory());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("fullHistory.failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`card space-y-3 p-4 ${eligible ? "border-mint/40" : ""}`}>
      <div>
        <h2 className="font-semibold">{t("fullHistory.title")}</h2>
        <p className="muted text-sm">{t("fullHistory.description", { date: formatMaybeDate(referenceAt) })}</p>
        {firstPeriod && lastPeriod ? <p className="muted text-xs">{t("fullHistory.coverage", { first: formatStatementPeriod(firstPeriod), last: formatStatementPeriod(lastPeriod), count: preview.data.statements })}</p> : null}
      </div>
      {eligible && after ? (
        <>
          <FullHistoryComparison after={after} preview={preview.data} prive={prive} />
          <button className="btn-primary" disabled={saving} onClick={() => { setConfirming(true); }} type="button">
            {saving ? t("fullHistory.saving") : t("fullHistory.action")}
          </button>
        </>
      ) : (
        <div className="text-sm">
          <h3 className="text-xs font-semibold uppercase text-slate-500">{t("fullHistory.missing")}</h3>
          <ul className="list-inside list-disc">{blockers.map((blocker) => <BlockerItem blocker={blocker} key={blocker.code} />)}</ul>
        </div>
      )}
      {error ? <p className="text-sm text-coral" role="alert">{error}</p> : null}
      {confirming ? (
        <ConfirmDialog
          confirmLabel={t("fullHistory.confirm")}
          description={t("fullHistory.confirmDescription")}
          onCancel={() => { setConfirming(false); }}
          onConfirm={() => { void complete(); }}
          title={t("fullHistory.confirmTitle")}
        />
      ) : null}
    </section>
  );
}
