import { CASH_MOVEMENT_TYPES, PEA_WITHDRAWAL_MATURITY_YEARS, type CashAccountSummary, type CashLedgerDto, type CashMovementType } from "@pea/shared";
import { useState, type SubmitEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCashFunding } from "../../../components/common/cash/useCashFunding";
import { ConfirmDialog } from "../../../components/common/feedback/ConfirmDialog";
import { api } from "../../../lib/api";
import { cashMoney, localInputToIso } from "../../../lib/cash/cash-format";
import { currentDateTimeLocalValue } from "../../../lib/dateTimeInput";
import { formatMaybeDate } from "../../../lib/format";
import type { LedgerAsset } from "../hooks/useCashLedger";

const yearMs = 365.25 * 24 * 60 * 60 * 1000;

function accountAgeYears(openedAt: string | undefined) {
  if (!openedAt) return undefined;
  const age = (Date.now() - new Date(openedAt).getTime()) / yearMs;
  return Number.isFinite(age) && age >= 0 ? Math.floor(age) : undefined;
}

/**
 * Versement, retrait, dividende encaissé ou frais indépendants. Le backend reste l'arbitre : le
 * retrait maximal affiché n'est qu'une aide, un retrait qui découvrirait le compte est refusé.
 */
export function CashMovementForm({ summary, assets, onSaved }: { summary: CashAccountSummary; assets: LedgerAsset[]; onSaved: (ledger: CashLedgerDto) => void }) {
  const { t } = useTranslation(["cash", "errors"]);
  const [type, setType] = useState<CashMovementType>("deposit");
  const [amount, setAmount] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(currentDateTimeLocalValue());
  const [positionId, setPositionId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [confirmingWithdrawal, setConfirmingWithdrawal] = useState(false);
  const cashFunding = useCashFunding((failure) => { setMessage({ tone: "error", text: failure instanceof Error ? failure.message : t("errors:unknown") }); });
  const age = accountAgeYears(summary.openedAt);
  const numericAmount = Number(amount);
  const exceedsCeiling = type === "deposit" && Number.isFinite(numericAmount) && numericAmount > summary.remainingCeiling;

  function validInput() {
    const iso = localInputToIso(effectiveAt);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || !iso) {
      setMessage({ tone: "error", text: t("errors:numericInvalid") });
      return undefined;
    }
    return iso;
  }

  async function save() {
    const iso = validInput();
    if (!iso) return;
    setMessage(null);
    await cashFunding.run(async (funding) => {
      const ledger = await api.createCashMovement({
        type,
        amount: numericAmount,
        effectiveAt: iso,
        positionId: (type === "dividend" || type === "fee") && positionId ? Number(positionId) : undefined,
        note: note.trim() || undefined,
        funding
      });
      setAmount("");
      setNote("");
      setMessage({ tone: "success", text: t("cash:movement.saved") });
      onSaved(ledger);
    });
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (type === "withdrawal") {
      if (validInput()) setConfirmingWithdrawal(true);
      return;
    }
    void save();
  }

  return (
    <section className="card space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{t("cash:movement.title")}</h2>
        <p className="muted text-sm">{type === "withdrawal" ? t("cash:movement.maxWithdrawal", { amount: cashMoney(Math.max(0, summary.cash)) }) : t("cash:movement.available", { amount: cashMoney(summary.cash) })}</p>
      </div>
      <form className="grid gap-3 md:grid-cols-[160px_1fr_1fr_1fr] md:items-end" onSubmit={submit}>
        <label>
          <span className="muted mb-1 block">{t("cash:movement.type")}</span>
          <select className="input" onChange={(event) => { setType(event.target.value as CashMovementType); }} value={type}>
            {CASH_MOVEMENT_TYPES.map((value) => <option key={value} value={value}>{t(`cash:kinds.${value}`)}</option>)}
          </select>
        </label>
        <label>
          <span className="muted mb-1 block">{t("cash:movement.amount")}</span>
          <input className="input" max={type === "withdrawal" ? Math.max(0, summary.cash) : undefined} min="0.01" onChange={(event) => { setAmount(event.target.value); }} required step="0.01" type="number" value={amount} />
        </label>
        <label>
          <span className="muted mb-1 block">{t("cash:movement.date")}</span>
          <input className="input" onChange={(event) => { setEffectiveAt(event.target.value); }} required type="datetime-local" value={effectiveAt} />
        </label>
        {type === "dividend" || type === "fee" ? (
          <label>
            <span className="muted mb-1 block">{t("cash:movement.position")}</span>
            <select className="input" onChange={(event) => { setPositionId(event.target.value); }} value={positionId}>
              <option value="">{t("cash:movement.noPosition")}</option>
              {assets.map((asset) => <option key={asset.positionId} value={asset.positionId}>{asset.symbol} · {asset.name}</option>)}
            </select>
          </label>
        ) : (
          <label>
            <span className="muted mb-1 block">{t("cash:movement.note")}</span>
            <input className="input" maxLength={200} onChange={(event) => { setNote(event.target.value); }} value={note} />
          </label>
        )}
        <div className="md:col-span-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-xs">
            {type === "withdrawal" ? (
              <p className={`rounded-md border p-2 ${age !== undefined && age < PEA_WITHDRAWAL_MATURITY_YEARS ? "border-coral/40 bg-coral/10 text-coral" : "border-amber/40 bg-amber/10 text-amber"}`}>
                {t("cash:movement.withdrawalWarning")}
                {age !== undefined ? ` ${t("cash:movement.withdrawalWarningAge", { years: age })}` : ""}
              </p>
            ) : null}
            {type === "dividend" ? <p className="muted">{t("cash:movement.dividendHint")}</p> : null}
            {exceedsCeiling ? <p className="text-amber">{t("cash:movement.ceilingExceeded", { ceiling: cashMoney(summary.depositCeiling) })}</p> : null}
          </div>
          <button className="btn-primary" type="submit">{t("cash:movement.submit")}</button>
        </div>
      </form>
      {message ? <p className={message.tone === "error" ? "text-sm text-coral" : "text-sm text-mint"} role="status">{message.text}</p> : null}
      {confirmingWithdrawal ? (
        <ConfirmDialog
          confirmLabel={t("cash:movement.submit")}
          description={`${t("cash:movement.confirmWithdrawal", { amount: cashMoney(numericAmount), date: formatMaybeDate(localInputToIso(effectiveAt)) })} ${t("cash:movement.withdrawalWarning")}`}
          onCancel={() => { setConfirmingWithdrawal(false); }}
          onConfirm={() => { setConfirmingWithdrawal(false); void save(); }}
          title={t("cash:movement.confirmWithdrawalTitle")}
        />
      ) : null}
      {cashFunding.dialog}
    </section>
  );
}
