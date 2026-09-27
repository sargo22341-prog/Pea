import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { unregisterServiceWorkers } from "./lib/app-loading/service-worker-cleanup";
import "./i18n";
import "./styles/index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Element #root introuvable dans index.html.");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

void unregisterServiceWorkers(navigator.serviceWorker);
