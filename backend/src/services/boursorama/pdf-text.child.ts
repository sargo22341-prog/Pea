import { PDFParse } from "pdf-parse";

/**
 * Processus enfant d'extraction PDF (voir `pdf-text-extractor.ts`) : reçoit le contenu du fichier,
 * renvoie son texte puis se termine. Un PDF piégé ou un plantage natif n'atteint pas le serveur.
 */
process.once("message", (data: Uint8Array) => {
  void (async () => {
    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      const result = await parser.getText();
      process.send?.({ text: result.text });
    } catch (error) {
      process.send?.({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      await parser.destroy();
      process.disconnect?.();
    }
  })();
});
