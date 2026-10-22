/**
 * Rendement des titres du PEA dans le temps, pondéré par les dates d'achat et de vente.
 *
 * Les flux pris en compte sont ceux des titres : achats (frais inclus), ventes (frais déduits) et
 * dividendes estimés (cours Yahoo × quantité détenue au détachement). Les espèces ne sont pas
 * valorisées : le rendement mesure ce que rapportent les titres, pas le placement des liquidités.
 */

/** Rendement d'une année civile (année partielle pour la première année et l'année en cours). */
export interface PortfolioYearReturn {
  year: number;
  /** Valeur des titres au 1er janvier (0 la première année). */
  startValue: number;
  /** Valeur des titres au 31 décembre, ou aujourd'hui pour l'année en cours. */
  endValue: number;
  /** Achats de l'année, frais inclus. */
  invested: number;
  /** Produit des ventes de l'année, frais déduits. */
  sold: number;
  /** Dividendes estimés détachés pendant l'année. */
  dividends: number;
  /** Plus-values de l'année, latentes et réalisées : valeur fin - valeur début - achats + ventes. */
  capitalGain: number;
  /** Gain total de l'année : plus-values + dividendes. */
  gain: number;
  /**
   * Rendement de l'année (méthode de Dietz modifiée : chaque apport compte au prorata du temps
   * passé investi). Non annualisé ; absent si le capital engagé est nul.
   */
  returnPercent?: number | undefined;
  /** Année incomplète : première année (depuis le premier achat) ou année en cours. */
  partial: boolean;
}

export interface PortfolioReturnsDto {
  /** Taux de rendement interne annualisé (TRI) des titres ; absent si l'historique couvre moins de 90 jours. */
  annualizedReturnPercent?: number | undefined;
  /** Date du premier achat daté. */
  firstInvestmentAt?: string | undefined;
  totalInvested: number;
  totalSold: number;
  totalDividends: number;
  /** Valeur actuelle des titres détenus. */
  currentValue: number;
  /** Gain total depuis le premier achat : valeur + ventes + dividendes - achats. */
  totalGain: number;
  years: PortfolioYearReturn[];
  /** Historique de cours en cours de téléchargement : les valeurs de fin d'année sont provisoires. */
  isPreparing: boolean;
  /** Actifs sans historique de cours : valorisés au dernier prix de transaction connu. */
  missingPriceSymbols: string[];
  /** Positions détenues sans transaction datée : exclues du calcul faute de date d'achat. */
  undatedSymbols: string[];
}
