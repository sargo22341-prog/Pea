import { useEffect, useState } from "react";
import { apiUrl, requestBlob } from "../lib/api-core";
import { isNativeApp } from "../lib/native-auth";

const nativeImageUrlCache = new Map<string, string>();
const nativeImageInFlight = new Map<string, Promise<string>>();

async function loadNativeImageUrl(path: string) {
  const cached = nativeImageUrlCache.get(path);
  if (cached) return cached;

  let inFlight = nativeImageInFlight.get(path);
  if (!inFlight) {
    inFlight = requestBlob(path)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        nativeImageUrlCache.set(path, objectUrl);
        return objectUrl;
      })
      .finally(() => {
        nativeImageInFlight.delete(path);
      });
    nativeImageInFlight.set(path, inFlight);
  }

  return inFlight;
}

export function useAuthenticatedImageUrl(path: string, version: number | string, enabled = true) {
  const [url, setUrl] = useState(() => enabled && !isNativeApp() ? apiUrl(path) : "");

  useEffect(() => {
    if (!enabled || !path) {
      setUrl("");
      return undefined;
    }

    if (!isNativeApp()) {
      setUrl(apiUrl(path));
      return undefined;
    }

    let active = true;
    loadNativeImageUrl(path)
      .then((objectUrl) => {
        if (!active) return;
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setUrl("");
      });

    return () => {
      active = false;
    };
  }, [enabled, path, version]);

  return url;
}
