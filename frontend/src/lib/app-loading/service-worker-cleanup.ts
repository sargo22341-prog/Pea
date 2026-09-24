// L'application n'enregistre plus de service worker : sous Firefox, les requetes qu'il
// interceptait au demarrage (chunks Vite, SSE) echouaient et seul Ctrl+F5 debloquait la page.
// On desinscrit donc toute ancienne installation encore presente dans le navigateur.
export async function unregisterServiceWorkers(container: ServiceWorkerContainer | undefined) {
  if (!container) return;
  try {
    const registrations = await container.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn("[app] service worker cleanup failed", error);
  }
}
