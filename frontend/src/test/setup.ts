import "@testing-library/jest-dom";
import "../i18n";

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: () => undefined
});

Object.defineProperty(Element.prototype, "scrollTo", {
  configurable: true,
  value: () => undefined
});
