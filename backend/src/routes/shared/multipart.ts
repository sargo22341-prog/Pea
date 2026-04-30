/**
 * Role du fichier : regrouper les petits parseurs multipart utilises par les routes.
 */

import type express from "express";
import { HttpError } from "../../utils/http-error.js";

/**
 * Extrait le fichier d'icone depuis une requete multipart brute.
 */
export function parseMultipartIcon(req: express.Request) {
  const contentType = req.headers["content-type"] ?? "";
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType))?.[1] ?? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType))?.[2];
  if (!boundary || !Buffer.isBuffer(req.body)) throw new HttpError(400, "Fichier image requis.");

  const body = req.body as Buffer;
  const marker = Buffer.from(`--${boundary}`);
  const parts: Buffer[] = [];
  let start = body.indexOf(marker);
  while (start !== -1) {
    const next = body.indexOf(marker, start + marker.length);
    if (next === -1) break;
    parts.push(body.subarray(start + marker.length, next));
    start = next;
  }

  for (const rawPart of parts) {
    const part = trimMultipartPart(rawPart);
    const separator = part.indexOf(Buffer.from("\r\n\r\n"));
    if (separator === -1) continue;
    const headers = part.subarray(0, separator).toString("utf8");
    if (!/name="icon"/i.test(headers) && !/filename="/i.test(headers)) continue;
    const mimeType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim().toLowerCase() ?? "application/octet-stream";
    const buffer = part.subarray(separator + 4);
    if (!buffer.length) throw new HttpError(400, "Fichier image vide.");
    return { buffer, mimeType };
  }

  throw new HttpError(400, "Fichier image requis.");
}

/**
 * Extrait une liste de fichiers depuis une requete multipart brute.
 */
export function parseMultipartFiles(req: express.Request, fieldName: string) {
  const contentType = req.headers["content-type"] ?? "";
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType))?.[1] ?? /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType))?.[2];
  if (!boundary || !Buffer.isBuffer(req.body)) throw new HttpError(400, "Fichier requis.");

  const body = req.body as Buffer;
  const marker = Buffer.from(`--${boundary}`);
  const files: Array<{ fileName: string; buffer: Buffer }> = [];
  let start = body.indexOf(marker);
  while (start !== -1) {
    const next = body.indexOf(marker, start + marker.length);
    if (next === -1) break;
    const part = trimMultipartPart(body.subarray(start + marker.length, next));
    const separator = part.indexOf(Buffer.from("\r\n\r\n"));
    if (separator !== -1) {
      const headers = part.subarray(0, separator).toString("utf8");
      const field = /name="([^"]+)"/i.exec(headers)?.[1];
      const fileName = /filename="([^"]+)"/i.exec(headers)?.[1];
      if (field === fieldName && fileName) {
        files.push({ fileName, buffer: part.subarray(separator + 4) });
      }
    }
    start = next;
  }
  if (!files.length) throw new HttpError(400, "Aucun PDF fourni.");
  return files;
}

/**
 * Nettoie les separateurs CRLF et fins de boundary d'une partie multipart.
 */
export function trimMultipartPart(part: Buffer) {
  let start = 0;
  let end = part.length;
  while (start < end && (part[start] === 13 || part[start] === 10)) start += 1;
  while (end > start && (part[end - 1] === 13 || part[end - 1] === 10 || part[end - 1] === 45)) end -= 1;
  return part.subarray(start, end);
}
