import { portfolioRepository } from "../../../repositories/portfolio/portfolio.repository.js";
import { HttpError } from "../../../utils/http-error.js";
import { isValidIsin, normalizeIsin } from "../../../utils/isin.js";

export const invalidIsinMessage = "ISIN invalide : deux lettres de pays, neuf caracteres et une cle de controle (ex. FR0000120271).";

/**
 * ISIN facultatif d'une position : il fixe le pays de la société pour la retenue à la source des
 * dividendes. Seul le propriétaire de la position peut le modifier ; `null` l'efface.
 */
export const positionIsinService = {
  set(userId: number, positionId: number, isin: string | null) {
    const position = portfolioRepository.findPositionById(positionId, userId);
    if (!position) throw new HttpError(404, "Position introuvable");
    const normalized = isin === null ? null : normalizeIsin(isin);
    if (normalized !== null && !isValidIsin(normalized)) throw new HttpError(400, invalidIsinMessage);
    portfolioRepository.updateIsin(userId, positionId, normalized);
    return { positionId, isin: normalized };
  }
};
