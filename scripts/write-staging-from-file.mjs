/** Pipe a payload file into write-staging-from-stdin: node write-staging-from-file.mjs LIST PAGE payload.json */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const [listId, page, src] = process.argv.slice(2);
if (!listId || page === undefined || !src) {
  console.error("Usage: write-staging-from-file.mjs LIST PAGE payload.json");
  process.exit(1);
}
const payload = fs.readFileSync(path.resolve(src), "utf8");
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
