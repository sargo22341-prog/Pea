import assert from "node:assert/strict";
import test from "node:test";
import { extractPdfText } from "../../../services/boursorama/pdf-text-extractor.js";
import { HttpError } from "../../../utils/http-error.js";

/** PDF d'une page affichant `text`, avec une table xref aux décalages exacts. */
function minimalPdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, index) => {
    const offset = pdf.length;
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("PDF text is extracted in a worker thread", async () => {
  const text = await extractPdfText(minimalPdf("Avis d'opere ACHAT 10 AIR LIQUIDE"));
  assert.match(text, /ACHAT 10 AIR LIQUIDE/);
});

test("an unreadable PDF is rejected as a client error", async () => {
  await assert.rejects(extractPdfText(Buffer.from("not a pdf")), (error: unknown) => error instanceof HttpError && error.status === 400);
});

test("a PDF analysis exceeding its delay is stopped", async () => {
  await assert.rejects(extractPdfText(minimalPdf("slow"), 1), (error: unknown) => error instanceof HttpError && error.message === "Analyse du PDF trop longue.");
});
