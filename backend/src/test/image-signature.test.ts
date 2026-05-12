import assert from "node:assert/strict";
import test from "node:test";
import { detectSupportedImageMime } from "../utils/image-signature.js";

test("detectSupportedImageMime accepts real PNG and JPEG signatures", () => {
  assert.equal(detectSupportedImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])), "image/png");
  assert.equal(detectSupportedImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00])), "image/jpeg");
});

test("detectSupportedImageMime rejects unsupported or spoofed content", () => {
  assert.equal(detectSupportedImageMime(Buffer.from("<svg></svg>")), undefined);
  assert.equal(detectSupportedImageMime(Buffer.from("not a png")), undefined);
});
