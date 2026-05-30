/** Ingest all JSON files from a directory via add-detailed-batch. */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) {
  console.error("Usage: node scripts/ingest-task-ids-from-mcp-inbox-dir.mjs <dir>");
  process.exit(1);
}
const tasks = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) =>
  JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))
);
if (!tasks.length) {
  console.log(JSON.stringify({ ingested: 0 }));
  process.exit(0);
}
const r = spawnSync("node", [path.join(__dirname, "build-clickup-import-cache.mjs"), "add-detailed-batch"], {
  cwd: path.join(__dirname, ".."),
  input: `${JSON.stringify(tasks)}\n`,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 0);
