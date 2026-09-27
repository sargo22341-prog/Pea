// Seule API Node utilisee par les tests frontend (execution isolee de public/sw.js).
// Les types Node complets ne sont pas charges dans le programme navigateur.
declare module "node:vm" {
  export function runInNewContext(code: string, contextObject?: object): unknown;
}
