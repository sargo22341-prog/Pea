/** Planifie un rappel au prochain rendu, avec repli sur setTimeout hors navigateur complet (tests, WebView restreinte). */
export function requestFrame(callback: FrameRequestCallback): number {
  if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(callback);
  return window.setTimeout(() => { callback(performance.now()); }, 0);
}

/** Annule un rappel planifie par requestFrame. */
export function cancelFrame(handle: number) {
  if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(handle);
  else window.clearTimeout(handle);
}
