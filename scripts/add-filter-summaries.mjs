/**
 * Merge filter_tasks page payload into summaries.json (stdin JSON: {tasks, count}).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SUMMARIES_PATH = path.join(ROOT, "src/data/.clickup-cache-build/summaries.json");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const map = fs.existsSync(SUMMARIES_PATH)
  ? JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"))
  : {};

for (const task of payload.tasks ?? []) {
  map[task.id] = { id: task.id, name: task.name, list: task.list };
}

fs.mkdirSync(path.dirname(SUMMARIES_PATH), { recursive: true });
fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Summaries: ${Object.keys(map).length} (+${payload.count ?? 0} from page)`);
