import { app } from "./app.js";
import { config } from "./config.js";

const server = app.listen(config.port, () => {
  console.log(`PEA Portfolio API listening on http://127.0.0.1:${config.port}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Stop the existing API process or set another PORT in .env.`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
