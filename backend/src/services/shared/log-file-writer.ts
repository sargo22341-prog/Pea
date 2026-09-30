import fs from "node:fs/promises";
import path from "node:path";

export interface LogFileWriterOptions {
  directory: () => string;
  /** Taille au-delà de laquelle un fichier est archivé en `<nom>.1`. */
  maxFileBytes: number;
  /** Nombre d'archives conservées par fichier (`<nom>.1` à `<nom>.N`). */
  rotatedFiles: number;
  /** Volume maximal en attente d'écriture : au-delà, les lignes sont comptées puis ignorées. */
  maxPendingBytes: number;
}

function isMissingFileError(error: unknown) {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/**
 * Écrit les logs de façon asynchrone, sans bloquer la boucle d'évènements, avec une rotation
 * par taille : le disque occupé reste borné même si des requêtes non authentifiées génèrent
 * des logs en masse. La mémoire en attente est bornée elle aussi.
 */
export class LogFileWriter {
  private pending = new Map<string, string[]>();
  private pendingBytes = 0;
  private droppedLines = 0;
  private sizes = new Map<string, number>();
  private draining: Promise<void> | undefined;

  constructor(private readonly options: LogFileWriterOptions) {}

  append(fileName: string, line: string) {
    const bytes = Buffer.byteLength(line);
    if (this.pendingBytes + bytes > this.options.maxPendingBytes) {
      this.droppedLines += 1;
      return;
    }
    this.pendingBytes += bytes;
    const lines = this.pending.get(fileName) ?? [];
    lines.push(line);
    this.pending.set(fileName, lines);
    this.draining ??= this.drain().finally(() => { this.draining = undefined; });
  }

  /** Attend l'écriture de toutes les lignes reçues (arrêt du serveur, tests). */
  async flush() {
    while (this.draining) await this.draining;
  }

  private async drain() {
    while (this.pending.size) {
      const batch = [...this.pending];
      this.pending.clear();
      this.pendingBytes = 0;
      // Les lignes ignorées faute de place sont signalées une fois, dans le premier fichier écrit.
      const [firstBatch] = batch;
      if (this.droppedLines && firstBatch) {
        firstBatch[1].push(`${JSON.stringify({ timestamp: new Date().toISOString(), level: "warn", message: "log lines dropped", dropped: this.droppedLines })}\n`);
        this.droppedLines = 0;
      }
      try {
        const directory = this.options.directory();
        await fs.mkdir(directory, { recursive: true });
        for (const [fileName, lines] of batch) {
          await this.write(path.join(directory, fileName), lines.join(""));
        }
      } catch (error) {
        console.error(`[logger] unable to write log file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async write(filePath: string, chunk: string) {
    const bytes = Buffer.byteLength(chunk);
    let size = this.sizes.get(filePath) ?? (await this.currentSize(filePath));
    if (size > 0 && size + bytes > this.options.maxFileBytes) {
      await this.rotate(filePath);
      size = 0;
    }
    await fs.appendFile(filePath, chunk, "utf8");
    this.sizes.set(filePath, size + bytes);
  }

  private async currentSize(filePath: string) {
    try {
      return (await fs.stat(filePath)).size;
    } catch (error) {
      if (isMissingFileError(error)) return 0;
      throw error;
    }
  }

  private async rotate(filePath: string) {
    for (let index = this.options.rotatedFiles; index >= 1; index -= 1) {
      const source = index === 1 ? filePath : `${filePath}.${index - 1}`;
      try {
        await fs.rename(source, `${filePath}.${index}`);
      } catch (error) {
        if (!isMissingFileError(error)) throw error;
      }
    }
  }
}
