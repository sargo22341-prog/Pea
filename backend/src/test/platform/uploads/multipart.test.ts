import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { parseMultipartFiles } from "../../../routes/shared/multipart.js";

test("multipart uploads without a filename expose an empty name", async () => {
  const app = express();
  app.post("/upload", async (req, res, next) => {
    try {
      const files = await parseMultipartFiles(req, "files");
      res.json(files.map((file) => ({
        fileName: file.fileName,
        mimeType: file.mimeType,
        content: file.buffer.toString()
      })));
    } catch (error) {
      next(error);
    }
  });
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/upload`, {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=upload-boundary" },
      body: [
        "--upload-boundary",
        'Content-Disposition: form-data; name="files"',
        "Content-Type: application/octet-stream",
        "",
        "file contents",
        "--upload-boundary--",
        ""
      ].join("\r\n")
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{
      fileName: "",
      mimeType: "application/octet-stream",
      content: "file contents"
    }]);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeAllConnections();
    });
  }
});
