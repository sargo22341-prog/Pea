import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import "../i18n";
import { clearAsyncDataCache } from "../lib/cache/async-data-cache";

// Le cache inter-pages de useAsync est global au module : chaque test repart d'un cache vide.
afterEach(() => {
  clearAsyncDataCache();
});

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: () => undefined
});

Object.defineProperty(Element.prototype, "scrollTo", {
  configurable: true,
  value: () => undefined
});
