import type { EditablePortfolioTransaction, PositionWithMarket } from "@pea/shared";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCashFunding } from "../../../../components/common/cash/useCashFunding";
import { api } from "../../../../lib/api";
import { draftTransaction, errorMessage, maxSellQuantity, parseNonNegativeNumber, toFormRow, type EditableTransactionFormRow } from "../editTransactionForm";

/**
 * Achats et ventes modifiables d'une position : chargement, saisie, enregistrement (avec la popup
 * de versement si les espèces manquent) et suppression.
 */
export function usePositionTransactions(position: PositionWithMarket, startWithDraft: boolean, onSaved: () => void | Promise<void>) {
  const { t } = useTranslation(["common", "errors", "portfolio"]);
  const [rows, setRows] = useState<EditableTransactionFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  async function save(row: EditableTransactionFormRow) {
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
      const body = { ...payload, funding };
      const nextRows = row.id.startsWith("draft-")
        ? await api.createPositionTransaction(position.id, body)
        : await api.updatePositionTransaction(position.id, row.id, body);
      setRows(nextRows.map(toFormRow));
      await onSaved();
    });
  }

  async function remove(row: EditableTransactionFormRow) {
    if (row.id.startsWith("draft-")) {
      setRows((current) => current.filter((item) => item.id !== row.id));
      return;
    }
    await cashFunding.run(async () => {
      await api.deletePositionTransaction(position.id, row.id);
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
    addDraft: () => { setRows((current) => [draftTransaction(position), ...current]); },
    patchRow,
    patchType,
    patchQuantity,
    save,
    remove
  };
}
