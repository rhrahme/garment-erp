/** Read NDJSON task lines from stdin; write /tmp/cu-{id}.json and mcp-inbox/{id}.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INBOX = path.join(__dirname, "../src/data/.clickup-cache-build/mcp-inbox");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n").filter(Boolean);

fs.mkdirSync(INBOX, { recursive: true });
let saved = 0;
for (const line of lines) {
  const task = JSON.parse(line);
  if (!task?.id) continue;
  const payload = `${JSON.stringify(task)}\n`;
  fs.writeFileSync(path.join(INBOX, `${task.id}.json`), payload);
  fs.writeFileSync(`/tmp/cu-${task.id}.json`, payload);
  saved++;
}
console.log(JSON.stringify({ saved, ids: lines.map((l) => JSON.parse(l).id) }));
