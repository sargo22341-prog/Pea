import { Capacitor, SystemBarType, SystemBars, SystemBarsStyle } from "@capacitor/core";
import { Style, StatusBar } from "@capacitor/status-bar";

type Rgb = { r: number; g: number; b: number; a: number };

const DEFAULT_TOP = "#071014";
const DEFAULT_BOTTOM = "#071014";
const LIGHT_BACKGROUND_THRESHOLD = 0.56;

let initialized = false;
let refreshHandle = 0;
let observer: MutationObserver | null = null;

export function initSystemBars() {
  if (!isNativeAndroid() || initialized) return;
  initialized = true;

  document.documentElement.classList.add("is-native-android");
  void refreshStatusBarInset();
  void SystemBars.show();
  void SystemBars.setStyle({ style: SystemBarsStyle.Dark });
  void StatusBar.show();
  void StatusBar.setOverlaysWebView({ overlay: true });
  queueSystemBarsRefresh();

  window.addEventListener("resize", queueSystemBarsRefresh);
  window.addEventListener("orientationchange", queueSystemBarsRefresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") queueSystemBarsRefresh();
  });

  observer = new MutationObserver(queueSystemBarsRefresh);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "style", "data-system-bars-tone", "data-system-bars-top", "data-system-bars-bottom"],
    childList: true,
    subtree: true
  });
}

export function queueSystemBarsRefresh() {
  if (!isNativeAndroid()) return;
  window.cancelAnimationFrame(refreshHandle);
  refreshHandle = window.requestAnimationFrame(() => {
    void applySystemBars();
  });
}

export function destroySystemBars() {
  if (!initialized) return;
  initialized = false;
  window.cancelAnimationFrame(refreshHandle);
  window.removeEventListener("resize", queueSystemBarsRefresh);
  window.removeEventListener("orientationchange", queueSystemBarsRefresh);
  observer?.disconnect();
  observer = null;
}

async function applySystemBars() {
  await refreshStatusBarInset();

  const topColor = readDeclaredColor("data-system-bars-top") ?? sampleColorAt("top") ?? DEFAULT_TOP;
  const bottomColor = readDeclaredColor("data-system-bars-bottom") ?? sampleColorAt("bottom") ?? DEFAULT_BOTTOM;
  const topIsLight = isLightColor(topColor);
  const bottomIsLight = isLightColor(bottomColor);

  setCssColor("--pea-system-bar-top", topColor);
  setCssColor("--pea-system-bar-bottom", bottomColor);

  await Promise.allSettled([
    SystemBars.show(),
    SystemBars.setStyle({ bar: SystemBarType.StatusBar, style: topIsLight ? SystemBarsStyle.Light : SystemBarsStyle.Dark }),
    SystemBars.setStyle({ bar: SystemBarType.NavigationBar, style: bottomIsLight ? SystemBarsStyle.Light : SystemBarsStyle.Dark }),
    StatusBar.setOverlaysWebView({ overlay: true }),
    StatusBar.setStyle({ style: topIsLight ? Style.Light : Style.Dark }),
    StatusBar.setBackgroundColor({ color: topColor })
  ]);
}

async function refreshStatusBarInset() {
  try {
    const { height } = await StatusBar.getInfo();
    document.documentElement.style.setProperty("--pea-safe-area-top", `${Math.max(0, height)}px`);
  } catch {
    document.documentElement.style.setProperty("--pea-safe-area-top", "0px");
  }
}

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function readDeclaredColor(attributeName: "data-system-bars-top" | "data-system-bars-bottom") {
  const element = document.querySelector<HTMLElement>(`[${attributeName}]`);
  const color = element?.getAttribute(attributeName);
  return normalizeCssColor(color);
}

function sampleColorAt(edge: "top" | "bottom") {
  const x = Math.max(1, Math.floor(window.innerWidth / 2));
  const y = edge === "top" ? 1 : Math.max(1, window.innerHeight - 2);
  const element = document.elementFromPoint(x, y);
  return element ? colorFromElement(element, edge) : null;
}

function colorFromElement(element: Element, edge: "top" | "bottom") {
  let current: Element | null = element;
  let blended: Rgb | null = null;

  while (current) {
    const style = window.getComputedStyle(current);
    const color = firstOpaqueBackground(style, edge);
    if (color) {
      blended = blend(color, blended ?? bodyBackground());
      if (blended.a >= 0.98) break;
    }
    current = current.parentElement;
  }

  return rgbToHex(blended ?? bodyBackground());
}

function firstOpaqueBackground(style: CSSStyleDeclaration, edge: "top" | "bottom") {
  const imageColor = colorFromGradient(style.backgroundImage, edge);
  if (imageColor) return imageColor;
  return parseRgb(style.backgroundColor);
}

function colorFromGradient(backgroundImage: string, edge: "top" | "bottom") {
  if (!backgroundImage || backgroundImage === "none") return null;
  const matches = backgroundImage.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
  if (!matches?.length) return null;
  return parseCssColor(edge === "top" ? matches[0] : matches[matches.length - 1]);
}

function bodyBackground() {
  return parseRgb(window.getComputedStyle(document.body).backgroundColor) ?? hexToRgb(DEFAULT_TOP);
}

function normalizeCssColor(value: string | null | undefined) {
  const parsed = parseCssColor(value ?? "");
  return parsed ? rgbToHex(parsed) : null;
}

function parseCssColor(value: string) {
  if (!value || value === "transparent") return null;
  if (value.startsWith("#")) return hexToRgb(value);
  return parseRgb(value);
}

function parseRgb(value: string) {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const [r, g, b, a = "1"] = match[1].split(",").map((part) => part.trim());
  return {
    r: Number(r),
    g: Number(g),
    b: Number(b),
    a: Number(a)
  };
}

function hexToRgb(value: string): Rgb {
  const hex = value.replace("#", "");
  const normalized = hex.length === 3 ? hex.split("").map((char) => char + char).join("") : hex.slice(0, 6);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: 1
  };
}

function blend(foreground: Rgb, background: Rgb): Rgb {
  const alpha = foreground.a + background.a * (1 - foreground.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: Math.round((foreground.r * foreground.a + background.r * background.a * (1 - foreground.a)) / alpha),
    g: Math.round((foreground.g * foreground.a + background.g * background.a * (1 - foreground.a)) / alpha),
    b: Math.round((foreground.b * foreground.a + background.b * background.a * (1 - foreground.a)) / alpha),
    a: alpha
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  return `#${[r, g, b].map((part) => clampColor(part).toString(16).padStart(2, "0")).join("")}`;
}

function clampColor(value: number) {
  return Math.min(255, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
}

function isLightColor(color: string) {
  const { r, g, b } = hexToRgb(color);
  const luminance = (0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b));
  return luminance > LIGHT_BACKGROUND_THRESHOLD;
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function setCssColor(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}
