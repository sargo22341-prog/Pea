/**
 * Role du fichier : afficher l'etat vide partage lorsque le portefeuille ne
 * contient encore aucune position exploitable.
 */

import { PlusCircle } from "lucide-react";
import { Link } from "react-router-dom";

export function EmptyState() {
  return (
    <div className="card flex min-h-[260px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full bg-panel2 p-4 text-mint">
        <PlusCircle size={32} />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Ajoutez votre première ligne</h2>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          Recherchez un ticker Yahoo Finance, indiquez votre quantité et votre prix moyen pour alimenter le dashboard.
        </p>
      </div>
      <Link className="btn-primary" to="/search">
        Ajouter une position
      </Link>
    </div>
  );
}
