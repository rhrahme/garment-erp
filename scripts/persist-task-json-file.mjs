/** Persist one task JSON file to detailed cache via add-detailed-batch. */
import fs from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");
const INBOX = path.join(ROOT, "src/data/.clickup-cache-build/mcp-inbox");

const src = process.argv[2];
if (!src) {
  console.error("Usage: persist-task-json-file.mjs <task.json>");
  process.exit(1);
}

const task = JSON.parse(fs.readFileSync(src, "utf8"));
if (!task?.id) {
  console.error("Missing task.id");
  process.exit(1);
}

fs.mkdirSync(INBOX, { recursive: true });
const payload = `${JSON.stringify(task)}\n`;
fs.writeFileSync(path.join(INBOX, `${task.id}.json`), payload);
fs.writeFileSync(`/tmp/cu-${task.id}.json`, payload);

const r = spawnSync("node", [build, "add-detailed-batch"], {
  cwd: ROOT,
  input: `${JSON.stringify([task])}\n`,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
console.log(`Persisted ${task.id}`);
process.exit(r.status ?? 0);
