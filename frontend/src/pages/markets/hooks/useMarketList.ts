import type { MarketListId } from "@pea/shared";
import { useState } from "react";
import { useAsync } from "../../../hooks/useAsync";
import { api } from "../../../lib/api";
import { MARKET_LISTS } from "../components/lists/market-lists";
import { readBooleanPreference, readLocalPreference, writeLocalPreference } from "../../../lib/local-preference";

const LIST_KEY = "markets.list";
const PEA_ONLY_KEY = "markets.peaOnly";

function storedList(): MarketListId {
  const stored = readLocalPreference(LIST_KEY);
  return MARKET_LISTS.find((list) => list.id === stored)?.id ?? "day_gainers";
}

/** Liste Yahoo choisie et filtre « PEA uniquement », mémorisés dans le navigateur. */
export function useMarketList() {
  const [listId, setListId] = useState<MarketListId>(storedList);
  const [peaOnly, setPeaOnly] = useState(() => readBooleanPreference(PEA_ONLY_KEY) ?? false);
  const result = useAsync((signal) => api.marketList(listId, peaOnly, signal), `${listId}:${String(peaOnly)}`);

  return {
    listId,
    peaOnly,
    result,
    selectList: (id: MarketListId) => {
      setListId(id);
      writeLocalPreference(LIST_KEY, id);
    },
    togglePeaOnly: () => {
      setPeaOnly(!peaOnly);
      writeLocalPreference(PEA_ONLY_KEY, String(!peaOnly));
    }
  };
}
