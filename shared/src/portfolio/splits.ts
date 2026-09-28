/** Décision d'un utilisateur face à une division (ou un regroupement) d'actions détectée. */
export type SplitDecision = "apply" | "ignore";
export type UserSplitStatus = "pending" | "applied" | "ignored";

/**
 * Division d'action qui concerne une position de l'utilisateur : au moins une de ses
 * transactions est antérieure à la date de la division.
 *
 * `numerator:denominator` suit la convention Yahoo : 10:1 = une action devient dix
 * (division), 1:10 = dix actions deviennent une (regroupement).
 */
export interface UserAssetSplit {
  id: number;
  symbol: string;
  assetName: string;
  positionId: number;
  /** Jour de la division (AAAA-MM-JJ) : les transactions antérieures sont ajustées. */
  date: string;
  numerator: number;
  denominator: number;
  status: UserSplitStatus;
}
