import type { FormEvent } from "react";
import { useState } from "react";
import { api } from "../lib/api";

export function useAddAssetPositionForm({
  symbol,
  name,
  currency,
  onSaved
}: {
  symbol: string;
  name: string;
  currency: string;
  onSaved: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [averageBuyPrice, setAverageBuyPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.addPosition({ symbol, name, quantity: Number(quantity), averageBuyPrice: Number(averageBuyPrice), currency });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout impossible");
    } finally {
      setSaving(false);
    }
  }

  return {
    averageBuyPrice,
    error,
    quantity,
    saving,
    setAverageBuyPrice,
    setQuantity,
    submit
  };
}
