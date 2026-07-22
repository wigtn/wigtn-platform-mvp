import { createWorker } from "./outbox.js";

const connectionString = process.env.OUTBOX_DATABASE_URL;
if (!connectionString) throw new Error("OUTBOX_DATABASE_URL is required");

const worker = createWorker(connectionString);
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

try {
  while (!stopping) {
    try {
      const result = await worker.tick();
      const changed =
        result.outbox.claimed + result.due.processed + result.demo.claimed > 0;
      if (changed) process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      process.stderr.write(
        `worker tick failed: ${error instanceof Error ? error.name : "unknown"}\n`,
      );
    }
    if (!stopping)
      await new Promise((resolve) =>
        setTimeout(resolve, Number(process.env.WORKER_POLL_MS ?? 1_000)),
      );
  }
} finally {
  await worker.close();
}
