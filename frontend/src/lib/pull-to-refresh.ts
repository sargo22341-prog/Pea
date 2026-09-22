import { Capacitor, registerPlugin } from "@capacitor/core";

interface PullToRefreshPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

const nativePullToRefresh = registerPlugin<PullToRefreshPlugin>("PEAPullToRefresh");

let suspendCount = 0;
let lastSyncedState: boolean | null = null;

/**
 * Suspend le geste natif « tirer pour recharger » jusqu'à l'appel de la fonction retournée.
 *
 * Le compteur permet d'empiler plusieurs fenêtres modales sans réactiver le geste tant que la
 * dernière n'est pas fermée.
 */
export function suspendPullToRefresh(): () => void {
  suspendCount += 1;
  syncNativeState();
  let released = false;

  return () => {
    if (released) return;
    released = true;
    suspendCount = Math.max(0, suspendCount - 1);
    syncNativeState();
  };
}

/** Exposé pour les tests : remet le compteur de suspensions à zéro. */
export function resetPullToRefreshSuspensions() {
  suspendCount = 0;
  lastSyncedState = null;
}

function syncNativeState() {
  if (!isNativeAndroid()) return;

  const enabled = suspendCount === 0;
  if (enabled === lastSyncedState) return;
  lastSyncedState = enabled;

  void nativePullToRefresh.setEnabled({ enabled }).catch(() => {
    // Le plugin natif est absent ou l'activité n'est pas prête : on réessaiera au prochain changement.
    lastSyncedState = null;
  });
}

function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
