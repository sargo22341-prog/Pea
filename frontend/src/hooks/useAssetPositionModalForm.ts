import type { PositionWithMarket } from "@pea/shared";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
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

export function useEditPositionForm({
  position,
  onClose,
  onSaved
}: {
  position: PositionWithMarket;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [quantity, setQuantity] = useState(String(position.quantity));
  const [averageBuyPrice, setAverageBuyPrice] = useState(String(position.averageBuyPrice));
  const [currency, setCurrency] = useState(position.currency);
  const [notes, setNotes] = useState(position.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuantity(String(position.quantity));
    setAverageBuyPrice(String(position.averageBuyPrice));
    setCurrency(position.currency);
    setNotes(position.notes ?? "");
  }, [position]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.updatePosition(position.id, {
        quantity: Number(quantity),
        averageBuyPrice: Number(averageBuyPrice),
        currency,
        notes: notes || undefined
      });
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modification impossible");
    } finally {
      setSaving(false);
    }
  }

  return {
    averageBuyPrice,
    currency,
    error,
    notes,
    quantity,
    saving,
    setAverageBuyPrice,
    setCurrency,
    setNotes,
    setQuantity,
    submit
  };
}
