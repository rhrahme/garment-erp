/** Ingest all *.json from mcp-inbox via add-detailed-batch, then delete inbox files. */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INBOX = path.join(ROOT, "src/data/.clickup-cache-build/mcp-inbox");
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

if (!fs.existsSync(INBOX)) {
  console.log(JSON.stringify({ ingested: 0 }));
  process.exit(0);
}
const tasks = fs
  .readdirSync(INBOX)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(INBOX, f), "utf8")));
if (!tasks.length) {
  console.log(JSON.stringify({ ingested: 0 }));
  process.exit(0);
}
const r = spawnSync("node", [build, "add-detailed-batch"], {
  cwd: ROOT,
  input: `${JSON.stringify(tasks)}\n`,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
if (r.status !== 0) process.exit(r.status ?? 1);
for (const f of fs.readdirSync(INBOX)) {
  if (f.endsWith(".json")) fs.unlinkSync(path.join(INBOX, f));
}
console.log(JSON.stringify({ ingested: tasks.length }));
