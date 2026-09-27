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
  const native = isNativeApp();
  const shouldLoadNative = enabled && Boolean(path) && native;
  // Seule l'application native charge l'image en blob (jeton d'auth) : l'etat ne sert qu'a ce cas.
  const [nativeUrl, setNativeUrl] = useState("");

  useEffect(() => {
    if (!shouldLoadNative) return undefined;

    let active = true;
    loadNativeImageUrl(path)
      .then((objectUrl) => {
        if (active) setNativeUrl(objectUrl);
      })
      .catch(() => {
        if (active) setNativeUrl("");
      });

    return () => {
      active = false;
    };
  }, [shouldLoadNative, path, version]);

  if (!enabled || !path) return "";
  return native ? nativeUrl : apiUrl(path);
}
