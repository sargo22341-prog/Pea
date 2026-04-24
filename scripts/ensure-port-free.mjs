import net from "node:net";

const port = Number(process.argv[2] ?? 4000);
const host = process.argv[3];

const server = net.createServer();

server.once("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing API process or change PORT in .env.`);
    process.exit(1);
  }

  console.error(error.message);
  process.exit(1);
});

server.once("listening", () => {
  server.close(() => process.exit(0));
});

server.listen(host ? { port, host } : { port });
