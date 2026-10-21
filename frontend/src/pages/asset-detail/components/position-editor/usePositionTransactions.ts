import type { EditablePortfolioTransaction, PositionWithMarket } from "@pea/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCashFunding } from "../../../../components/common/cash/useCashFunding";
import { api } from "../../../../lib/api";
import { isCashStatementVerifiedError, isCashVerified } from "../../../../lib/cash/cash-statement-check";
import { isDuplicateTransactionError } from "../../../../lib/portfolio/duplicate-transaction";
import { draftTransaction, errorMessage, maxSellQuantity, parseNonNegativeNumber, toFormRow, type EditableTransactionFormRow } from "../editTransactionForm";

interface TransactionConsent {
  confirmDuplicate?: boolean;
  confirmUnverify?: boolean;
}

/**
 * Achats et ventes modifiables d'une position : chargement, saisie, enregistrement (avec la popup
 * de versement si les espèces manquent) et suppression.
 */
export function usePositionTransactions(position: PositionWithMarket, startWithDraft: boolean, onSaved: () => void | Promise<void>) {
  const { t } = useTranslation(["common", "errors", "portfolio"]);
  const [rows, setRows] = useState<EditableTransactionFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<EditableTransactionFormRow | null>(null);
  const [pendingUnverify, setPendingUnverify] = useState<EditableTransactionFormRow | null>(null);
  const cashFunding = useCashFunding((failure) => { setError(errorMessage(failure, t)); });

  useEffect(() => {
    let alive = true;
    api.positionTransactions(position.id)
      .then((transactions) => {
        if (!alive) return;
        const nextRows = transactions.map(toFormRow);
        setRows(nextRows.length || !startWithDraft ? nextRows : [draftTransaction(position)]);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : t("errors:loadFailed"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [position, position.id, startWithDraft, t]);

  function patchRow(index: number, patch: Partial<EditableTransactionFormRow>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function patchType(index: number, type: EditablePortfolioTransaction["type"]) {
    setRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const numericQuantity = Number(row.quantity);
        const quantity = type === "sell" && Number.isFinite(numericQuantity) ? String(Math.min(numericQuantity, maxSellQuantity(row, position))) : row.quantity;
        return { ...row, type, quantity };
      })
    );
  }

  function patchQuantity(index: number, rawValue: string, row: EditableTransactionFormRow) {
    const value = Number(rawValue);
    const quantity = rawValue.trim() && Number.isFinite(value) && row.type === "sell" ? String(Math.min(value, maxSellQuantity(row, position))) : rawValue;
    patchRow(index, { quantity });
  }

  /**
   * Une opération identique à une opération déjà saisie, ou la modification d'une opération
   * vérifiée par relevé espèces, n'est enregistrée qu'après confirmation.
   */
  async function save(row: EditableTransactionFormRow, consent: TransactionConsent = {}) {
    let quantity: number;
    let price: number;
    let totalFees: number;
    try {
      quantity = parseNonNegativeNumber(row.quantity, t("common:fields.quantity"), t);
      price = parseNonNegativeNumber(row.price, t("common:fields.price"), t);
      totalFees = parseNonNegativeNumber(row.totalFees, t("common:fields.fees"), t);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : t("errors:numericInvalid"));
      return;
    }
    if (quantity <= 0) {
      setError(t("errors:quantityStrictlyPositive"));
      return;
    }
    const sellLimit = maxSellQuantity(row, position);
    if (row.type === "sell" && quantity > sellLimit) {
      setError(t("portfolio:position.soldQuantityTooHigh", { quantity: sellLimit }));
      return;
    }
    setError(null);
    const payload = { tradedAt: row.tradedAt, type: row.type === "sell" ? "sell" : "buy", quantity, price, totalFees, currency: row.currency } as const;
    // Un achat non couvert par les espèces ouvre la popup de versement, puis est rejoué avec lui.
    await cashFunding.run(async (funding) => {
      const body = { ...payload, funding, ...consent };
      try {
        const nextRows = row.id.startsWith("draft-")
          ? await api.createPositionTransaction(position.id, body)
          : await api.updatePositionTransaction(position.id, row.id, body);
        setRows(nextRows.map(toFormRow));
      } catch (failure) {
        if (isDuplicateTransactionError(failure)) setPendingDuplicate(row);
        else if (isCashStatementVerifiedError(failure)) setPendingUnverify(row);
        else throw failure;
        return;
      }
      await onSaved();
    });
  }

  function resolveDuplicate(confirmed: boolean) {
    const row = pendingDuplicate;
    setPendingDuplicate(null);
    if (confirmed && row) void save(row, { confirmDuplicate: true });
  }

  function resolveUnverify(confirmed: boolean) {
    const row = pendingUnverify;
    setPendingUnverify(null);
    if (confirmed && row) void save(row, { confirmUnverify: true });
  }

  async function remove(row: EditableTransactionFormRow) {
    if (row.id.startsWith("draft-")) {
      setRows((current) => current.filter((item) => item.id !== row.id));
      return;
    }
    await cashFunding.run(async () => {
      // La confirmation de suppression prévient du retrait de la vérification par relevé espèces.
      await api.deletePositionTransaction(position.id, row.id, isCashVerified(row.cashCheck));
      setError(null);
      setRows((current) => current.filter((item) => item.id !== row.id));
      await onSaved();
    });
  }

  return {
    rows,
    loading,
    error,
    fundingDialog: cashFunding.dialog,
    pendingDuplicate,
    resolveDuplicate,
    pendingUnverify,
    resolveUnverify,
    addDraft: () => { setRows((current) => [draftTransaction(position), ...current]); },
    patchRow,
    patchType,
    patchQuantity,
    save,
    remove
  };
}
