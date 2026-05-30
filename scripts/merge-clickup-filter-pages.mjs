/**
 * Merge ClickUp filter_tasks page JSON files into summaries state.
 * Usage: node scripts/merge-clickup-filter-pages.mjs page1.json page2.json ...
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const STATE_DIR = path.join(ROOT, "src/data/.clickup-cache-build");
const SUMMARIES_PATH = path.join(STATE_DIR, "summaries.json");

function loadSummaries() {
  if (!fs.existsSync(SUMMARIES_PATH)) return {};
  return JSON.parse(fs.readFileSync(SUMMARIES_PATH, "utf8"));
}

const map = loadSummaries();
for (const file of process.argv.slice(2)) {
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const task of payload.tasks ?? []) {
    map[task.id] = { id: task.id, name: task.name, list: task.list };
  }
}

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.writeFileSync(SUMMARIES_PATH, `${JSON.stringify(map, null, 2)}\n`);
console.log(`Merged ${Object.keys(map).length} unique task summaries`);
