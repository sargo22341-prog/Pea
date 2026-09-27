import type { Quote } from "@pea/shared";
import { useState } from "react";
import { i18n } from "../../../i18n";
import { api } from "../../../lib/api";

export function useAssetWatchlist({
  initialWatchlisted,
  onError,
  quote
}: {
  initialWatchlisted?: boolean | undefined;
  onError: (message: string) => void;
  quote?: Pick<Quote, "symbol" | "name" | "exchange" | "currency"> | undefined;
}) {
  const [watchlisted, setWatchlisted] = useState(Boolean(initialWatchlisted));
  const [syncedInitialWatchlisted, setSyncedInitialWatchlisted] = useState(initialWatchlisted);
  // Nouvelle valeur serveur : elle remplace l'etat local (ajustement pendant le rendu, sans effet).
  if (syncedInitialWatchlisted !== initialWatchlisted) {
    setSyncedInitialWatchlisted(initialWatchlisted);
    setWatchlisted(Boolean(initialWatchlisted));
  }

  async function toggleWatchlist() {
    if (!quote) return;

    const next = !watchlisted;
    setWatchlisted(next);

    try {
      if (next) {
        await api.addWatchlist({
          symbol: quote.symbol,
          name: quote.name,
          exchange: quote.exchange,
          currency: quote.currency
        });
      } else {
        await api.removeWatchlist(quote.symbol);
      }
    } catch (error) {
      setWatchlisted(!next);
      onError(error instanceof Error ? error.message : i18n.t("errors:watchlistUnavailable"));
    }
  }

  return { toggleWatchlist, watchlisted };
}
