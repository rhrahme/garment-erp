/** Read JSON array of tasks from file path (argv[2]) or stdin; write each to mcp-inbox/{id}.json */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INBOX = path.join(__dirname, "../src/data/.clickup-cache-build/mcp-inbox");

const source = process.argv[2];
const raw = source ? fs.readFileSync(source, "utf8") : fs.readFileSync(0, "utf8");
const tasks = JSON.parse(raw);
if (!Array.isArray(tasks)) {
  console.error("Expected JSON array of tasks");
  process.exit(1);
}

fs.mkdirSync(INBOX, { recursive: true });
let saved = 0;
for (const task of tasks) {
  if (!task?.id) continue;
  fs.writeFileSync(path.join(INBOX, `${task.id}.json`), `${JSON.stringify(task)}\n`);
  saved++;
}
console.log(JSON.stringify({ saved, ids: tasks.map((t) => t.id).filter(Boolean) }));
