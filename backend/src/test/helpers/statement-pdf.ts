/**
 * PDF minimal d'une page dont chaque ligne de `lines` est écrite à une hauteur distincte : le
 * texte extrait par `pdf-parse` reproduit ces lignes. Réservé aux tests (texte ASCII uniquement).
 */
export function linesPdf(lines: readonly string[]) {
  const escape = (text: string) => text.replace(/[\\()]/g, (char) => `\\${char}`);
  const body = lines.map((line, index) => `BT /F1 9 Tf 20 ${780 - index * 14} Td (${escape(line)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 800] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/** Relevé synthétique d'avril 2026 : TotalEnergies 38,25 € le 31/03, FDJ 73,50 € le 28/04. */
export const syntheticStatementLines = [
  "COUPONS REMBOURSEMENTS : AVRIL 2026",
  "DETAIL COUPONS",
  "31/03/2026 45 TOTALENERGIES SE (FR0000120271) 38,25 38,25 38,25",
  "28/04/2026 35 FDJ (FR0013451333) 73,50 73,50 73,50",
  "TOTAL EUR 0,00 0,00 111,75 0,00 111,75",
  "COUPONS : NETS FISCAUX 111,75 EUR",
  "REMBOURSEMENTS : BRUTS GLOBAUX 0,00 EUR",
  "Feuillet 1/1"
];
