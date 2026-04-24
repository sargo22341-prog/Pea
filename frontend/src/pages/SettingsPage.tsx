import { Database, Server } from "lucide-react";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Paramètres</h1>
        <p className="muted">Préparation des futures options: devise de référence, import et base d’éligibilité PEA.</p>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <Database className="mb-3 text-sky" />
          <h2 className="font-semibold">Base PEA locale</h2>
          <p className="mt-2 text-sm text-slate-400">
            La structure d’éligibilité est prête côté résultats de recherche. Une table locale pourra être branchée sans changer le frontend.
          </p>
        </div>
        <div className="card p-4">
          <Server className="mb-3 text-mint" />
          <h2 className="font-semibold">Cache Yahoo Finance</h2>
          <p className="mt-2 text-sm text-slate-400">
            Les cotations et dividendes sont mis en cache dans SQLite pour limiter les appels réseau et stabiliser l’expérience.
          </p>
        </div>
      </section>
    </div>
  );
}
