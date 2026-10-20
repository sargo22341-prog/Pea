const isinPattern = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/** Normalise une saisie d'ISIN (espaces retirés, majuscules). */
export function normalizeIsin(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

/**
 * ISIN valide (ISO 6166) : deux lettres de pays, neuf caractères alphanumériques et une clé de
 * contrôle. Les lettres valent 10 à 35, puis l'algorithme de Luhn s'applique à la suite de chiffres.
 */
export function isValidIsin(value: string) {
  if (!isinPattern.test(value)) return false;
  const digits = value.replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
