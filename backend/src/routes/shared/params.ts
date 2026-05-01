import { HttpError } from "../../utils/http-error.js";

export function routeParam(value: string | string[] | undefined, name: string) {
  if (typeof value === "string" && value.trim()) return value;
  throw new HttpError(400, `Parametre ${name} invalide.`);
}
