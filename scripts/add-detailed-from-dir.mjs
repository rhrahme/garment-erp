/** Add all JSON task files from a directory via add-detailed-batch */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2];
if (!dir) {
  console.error("Usage: add-detailed-from-dir.mjs <dir>");
  process.exit(1);
}
const tasks = [];
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith(".json")) continue;
  tasks.push(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}
const build = path.join(__dirname, "build-clickup-import-cache.mjs");
const r = spawnSync("node", [build, "add-detailed-batch"], {
  input: `${JSON.stringify(tasks)}\n`,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 0);
