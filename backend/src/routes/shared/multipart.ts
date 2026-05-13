import Busboy from "busboy";
import type express from "express";
import { HttpError } from "../../utils/http-error.js";

export interface UploadedFile {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

function ensureMultipart(req: express.Request) {
  if (!String(req.headers["content-type"] ?? "").toLowerCase().includes("multipart/form-data")) {
    throw new HttpError(400, "Requete multipart requise.");
  }
}

export function parseMultipartFiles(req: express.Request, fieldName: string, options: { maxFiles?: number; maxFileSize?: number } = {}) {
  ensureMultipart(req);
  const maxFiles = options.maxFiles ?? 20;
  const maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024;

  return new Promise<UploadedFile[]>((resolve, reject) => {
    const files: UploadedFile[] = [];
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const busboy = Busboy({
      headers: req.headers,
      limits: { files: maxFiles, fileSize: maxFileSize }
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
          fileName: info.filename,
          mimeType: info.mimeType.toLowerCase(),
          buffer
        });
      });
    });

    busboy.on("filesLimit", () => fail(new HttpError(400, "Trop de fichiers fournis.")));
    busboy.on("error", fail);
    busboy.on("finish", () => {
      if (settled) return;
      settled = true;
      if (!files.length) {
        reject(new HttpError(400, "Aucun fichier fourni."));
        return;
      }
      resolve(files);
    });

    req.pipe(busboy);
  });
}

export async function parseMultipartIcon(req: express.Request) {
  const [file] = await parseMultipartFiles(req, "icon", { maxFiles: 1, maxFileSize: 1024 * 1024 });
  if (!file?.buffer.length) throw new HttpError(400, "Fichier image requis.");
  return file;
}
