/** stdin: JSON array of filter_tasks payloads {tasks, count} */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SUMMARIES_PATH = path.join(ROOT, "src/data/.clickup-cache-build/summaries.json");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const payloads = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const map = fs.existsSync(SUMMARIES_PATH)
  ? JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"))
  : {};

let added = 0;
for (const payload of payloads) {
  for (const task of payload.tasks ?? []) {
    if (!map[task.id]) added += 1;
    map[task.id] = { id: task.id, name: task.name, list: task.list };
  }
}

fs.mkdirSync(path.dirname(SUMMARIES_PATH), { recursive: true });
fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Summaries: ${Object.keys(map).length} (${added} new)`);
