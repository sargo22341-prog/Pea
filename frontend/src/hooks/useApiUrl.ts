import { useEffect, useState } from "react";
import { apiUrl, resolveApiUrl } from "../lib/api-core";

export function useApiUrl(path: string, version?: number | string) {
  const [url, setUrl] = useState(() => apiUrl(path));

  useEffect(() => {
    let active = true;
    void resolveApiUrl(path)
      .then((resolved) => {
        if (active) setUrl(resolved);
      })
      .catch(() => {
        if (active) setUrl(apiUrl(path));
      });
    return () => {
      active = false;
    };
  }, [path, version]);

  return url;
}
