/** Pipe payload JSON files into write-staging-from-stdin.mjs */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

for (const file of process.argv.slice(2)) {
  const base = path.basename(file, ".json");
  const m = base.match(/^(\d+)-p(\d+)$/);
  if (!m) {
    console.error(`Bad filename (expected LISTID-pN.json): ${base}`);
    process.exit(1);
  }
  const [, listId, page] = m;
  const payload = fs.readFileSync(file, "utf8");
  const r = spawnSync("node", ["scripts/write-staging-from-stdin.mjs", listId, page], {
    cwd: ROOT,
    input: payload,
    encoding: "utf8",
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) {
    if (r.stderr) process.stderr.write(r.stderr);
    process.exit(r.status ?? 1);
  }
}
