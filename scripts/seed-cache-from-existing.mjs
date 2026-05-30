/**
 * Seed .clickup-cache-build/detailed from existing clickup-import-cache.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CACHE_PATH = path.join(ROOT, "src/data/clickup-import-cache.json");
const DETAILED_DIR = path.join(ROOT, "src/data/.clickup-cache-build/detailed");

if (!fs.existsSync(CACHE_PATH)) {
  console.log("No existing cache");
  process.exit(0);
}

const tasks = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
fs.mkdirSync(DETAILED_DIR, { recursive: true });
for (const task of tasks) {
  fs.writeFileSync(
    path.join(DETAILED_DIR, `${task.id}.json`),
    `${JSON.stringify(task, null, 2)}\n`
  );
}
console.log(`Seeded ${tasks.length} detailed tasks from existing cache`);
