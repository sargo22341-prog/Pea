import Busboy from "busboy";
import type express from "express";
import { HttpError } from "../../utils/http-error.js";

export interface UploadedFile {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

function ensureMultipart(req: express.Request) {
  if (!(req.headers["content-type"] ?? "").toLowerCase().includes("multipart/form-data")) {
    throw new HttpError(400, "Requete multipart requise.");
  }
}

export interface MultipartForm {
  files: UploadedFile[];
  /** Champs texte du formulaire (le dernier l'emporte pour un nom répété). */
  fields: Record<string, string>;
}

/** Taille maximale d'un champ texte (décisions d'un import, par exemple). */
const maxFieldSize = 256 * 1024;

export async function parseMultipartFiles(req: express.Request, fieldName: string, options: { maxFiles?: number; maxFileSize?: number } = {}) {
  return (await parseMultipartForm(req, fieldName, options)).files;
}

export function parseMultipartForm(req: express.Request, fieldName: string, options: { maxFiles?: number; maxFileSize?: number } = {}) {
  ensureMultipart(req);
  const maxFiles = options.maxFiles ?? 20;
  const maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024;

  return new Promise<MultipartForm>((resolve, reject) => {
    const files: UploadedFile[] = [];
    const fields: Record<string, string> = {};
    let settled = false;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const busboy = Busboy({
      headers: req.headers,
      limits: { files: maxFiles, fileSize: maxFileSize, fieldSize: maxFieldSize }
    });

    busboy.on("field", (name, value, info) => {
      if (info.valueTruncated) {
        fail(new HttpError(400, "Champ de formulaire trop long."));
        return;
      }
      fields[name] = value;
    });

    busboy.on("file", (name, stream, info) => {
      if (name !== fieldName) {
        stream.resume();
        return;
      }

      const chunks: Buffer[] = [];
      let truncated = false;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        truncated = true;
        stream.resume();
      });
      stream.on("error", fail);
      stream.on("end", () => {
        if (truncated) {
          fail(new HttpError(400, "Fichier trop lourd."));
          return;
        }
        const buffer = Buffer.concat(chunks);
        if (!buffer.length) return;
        files.push({
          fileName: info.filename ?? "",
          mimeType: info.mimeType.toLowerCase(),
          buffer
        });
      });
    });

    busboy.on("filesLimit", () => { fail(new HttpError(400, "Trop de fichiers fournis.")); });
    busboy.on("error", fail);
    busboy.on("finish", () => {
      if (settled) return;
      settled = true;
      if (!files.length) {
        reject(new HttpError(400, "Aucun fichier fourni."));
        return;
      }
      resolve({ files, fields });
    });

    req.pipe(busboy);
  });
}

export async function parseMultipartIcon(req: express.Request) {
  const [file] = await parseMultipartFiles(req, "icon", { maxFiles: 1, maxFileSize: 1024 * 1024 });
  if (!file?.buffer.length) throw new HttpError(400, "Fichier image requis.");
  return file;
}
