/**
 * Dividende annoncé : une date de détachement future publiée par la société prime sur la reprise
 * du calendrier de l'an dernier. Fonctions pures, sans accès aux données.
 */

/**
 * Écart maximal entre deux dates considérées comme le même versement (estimation et annonce,
 * estimation et détachement réel décalé d'un mois civil). Inférieur à l'écart entre deux
 * versements trimestriels, pour ne jamais confondre un versement avec son voisin.
 */
export const PAYMENT_MATCH_WINDOW_DAYS = 45;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Deux dates (ms) désignent-elles le même versement ? */
export function isSamePayment(firstTime: number, secondTime: number) {
  return Math.abs(firstTime - secondTime) <= PAYMENT_MATCH_WINDOW_DAYS * DAY_MS;
}

export interface DatedAmount {
  date: string;
  amountPerShare: number;
}

export interface DividendAnnouncement {
  /** Date de détachement annoncée (ISO, future). */
  exDividendDate: string;
  /** Dividende annuel annoncé par action (`dividendRate`). */
  annualDividendRate: number;
  /**
   * Versements réels par action des douze mois précédant la date annoncée : base de comparaison
   * du dividende annuel, insensible aux versements décalés d'une année civile sur l'autre.
   */
  trailingYearPayments: readonly number[];
}

/** Estimation la plus proche de la date annoncée, dans la fenêtre de rapprochement. */
export function matchingEstimateIndex(estimates: readonly DatedAmount[], announcedDate: string): number {
  const announcedTime = Date.parse(announcedDate);
  let closestIndex = -1;
  let closestGap = Number.POSITIVE_INFINITY;
  estimates.forEach((estimate, index) => {
    const estimateTime = Date.parse(estimate.date);
    const gap = Math.abs(estimateTime - announcedTime);
    if (isSamePayment(estimateTime, announcedTime) && gap < closestGap) {
      closestIndex = index;
      closestGap = gap;
    }
  });
  return closestIndex;
}

/**
 * Montant par action du versement annoncé. Quand il remplace une estimation, le versement de l'an
 * dernier est mis à l'échelle du nouveau dividende annuel rapporté aux douze derniers mois
 * (acompte et solde inégaux conservent leur proportion) ; sinon le dividende annuel est réparti
 * sur le nombre de versements des douze derniers mois.
 */
export function announcedAmountPerShare(announcement: DividendAnnouncement, replaced: DatedAmount | undefined): number | undefined {
  const { annualDividendRate, trailingYearPayments } = announcement;
  if (!Number.isFinite(annualDividendRate) || annualDividendRate <= 0) return undefined;
  const trailingTotal = trailingYearPayments.reduce((sum, amount) => sum + amount, 0);
  if (replaced && trailingTotal > 0) return replaced.amountPerShare * (annualDividendRate / trailingTotal);
  return annualDividendRate / Math.max(1, trailingYearPayments.length);
}

/**
 * Applique l'annonce aux estimations d'une position : l'estimation rapprochée est remplacée par le
 * versement annoncé, ou celui-ci s'ajoute. Retourne les estimations inchangées si le montant ne
 * peut pas être déterminé.
 */
export function withAnnouncedDividend<T extends DatedAmount>(
  estimates: readonly T[],
  announcement: DividendAnnouncement,
  toEvent: (date: string, amountPerShare: number) => T
): T[] {
  const index = matchingEstimateIndex(estimates, announcement.exDividendDate);
  const replaced = index === -1 ? undefined : estimates[index];
  const amountPerShare = announcedAmountPerShare(announcement, replaced);
  if (amountPerShare === undefined) return [...estimates];
  const kept = estimates.filter((_, candidate) => candidate !== index);
  return [...kept, toEvent(announcement.exDividendDate, amountPerShare)].sort((a, b) => a.date.localeCompare(b.date));
}
