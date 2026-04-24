import http from "node:http";
import https from "node:https";

const url = new URL(process.argv[2] ?? "http://127.0.0.1:4000/health");
const timeoutMs = Number(process.env.WAIT_FOR_HEALTH_TIMEOUT_MS ?? 30_000);
const startedAt = Date.now();

function probe() {
  return new Promise((resolve) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(url, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });

    request.setTimeout(1_000, () => {
      request.destroy();
      resolve(false);
    });

    request.on("error", () => resolve(false));
  });
}

async function wait() {
  while (Date.now() - startedAt < timeoutMs) {
    if (await probe()) process.exit(0);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  console.error(`Timeout waiting for ${url.toString()}`);
  process.exit(1);
}

await wait();
