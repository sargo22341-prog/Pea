import { useEffect, useState } from "react";
import { apiUrl, requestBlob, resolveApiUrl } from "../lib/api-core";
import { isNativeApp } from "../lib/native-auth";

export function useAuthenticatedImageUrl(path: string, version: number | string) {
  const [url, setUrl] = useState(() => apiUrl(path));

  useEffect(() => {
    if (!isNativeApp()) {
      void resolveApiUrl(path).then(setUrl).catch(() => setUrl(apiUrl(path)));
      return undefined;
    }

    let objectUrl: string | undefined;
    let active = true;
    requestBlob(path)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setUrl("");
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, version]);

  return url;
}
