import { createWorker } from "./outbox.js";

const connectionString = process.env.OUTBOX_DATABASE_URL;
if (!connectionString) throw new Error("OUTBOX_DATABASE_URL is required");

const worker = createWorker(connectionString);
try {
  const result = await worker.tick();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await worker.close();
}
