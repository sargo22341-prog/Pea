import type { Quote } from "@pea/shared";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export function useAssetWatchlist({
  initialWatchlisted,
  onError,
  quote
}: {
  initialWatchlisted?: boolean;
  onError: (message: string) => void;
  quote?: Pick<Quote, "symbol" | "name" | "exchange" | "currency">;
}) {
  const [watchlisted, setWatchlisted] = useState(false);

  useEffect(() => {
    setWatchlisted(Boolean(initialWatchlisted));
  }, [initialWatchlisted]);

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
      onError(error instanceof Error ? error.message : "Liste de suivi impossible");
    }
  }

  return { toggleWatchlist, watchlisted };
}
