/** Add one detailed task from stdin: node mcp-add-detailed.mjs < task.json */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const build = path.join(__dirname, "build-clickup-import-cache.mjs");

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const task = JSON.parse(Buffer.concat(chunks).toString("utf8"));
const r = spawnSync("node", [build, "add-detailed"], {
  input: `${JSON.stringify(task)}\n`,
  encoding: "utf8",
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status ?? 0);
