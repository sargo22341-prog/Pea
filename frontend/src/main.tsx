import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { unregisterServiceWorkers } from "./lib/app-loading/service-worker-cleanup";
import { i18nReady } from "./i18n";
import "./styles/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Element #root introuvable dans index.html.");

const root = ReactDOM.createRoot(rootElement);

// Les traductions de la langue choisie (chunk séparé hors français) sont prêtes avant le premier
// rendu ; un échec laisse l'interface dans la langue de repli plutôt que de bloquer l'application.
void i18nReady.catch((error: unknown) => {
  console.error("[i18n] langue initiale indisponible", error);
}).then(() => {
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});

void unregisterServiceWorkers(navigator.serviceWorker);
