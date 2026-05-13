import type { AssetDetails, AssetIcon, RangeKey } from "@pea/shared";
import { request } from "./api-core";

export const assetApi = {
  asset: (symbol: string, range: RangeKey) => request<AssetDetails>(`/api/assets/${encodeURIComponent(symbol)}?range=${range}`),
  uploadAssetIcon: (symbol: string, file: File) => {
    const formData = new FormData();
    formData.append("icon", file);
    return request<AssetIcon>(`/api/assets/${encodeURIComponent(symbol)}/icon`, { method: "POST", body: formData });
  },
  resetAssetIcon: (symbol: string) => request<void>(`/api/assets/${encodeURIComponent(symbol)}/icon`, { method: "DELETE" }),
  assetIcons: () => request<Array<{ symbol: string; name: string; icon?: AssetIcon }>>("/api/asset-icons")
};
