/**
 * Fetch one filter_tasks page via ClickUp MCP (cursor agent passes payloads)
 * and write to _staging via write-staging-from-stdin.
 *
 * Usage: node scripts/mcp-fetch-to-staging.mjs <payload.json> <listId> <page>
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const [src, listId, page] = process.argv.slice(2);
if (!src || !listId || page === undefined) {
  console.error("Usage: mcp-fetch-to-staging.mjs <payload.json> <listId> <page>");
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
