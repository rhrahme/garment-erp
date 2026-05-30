/** Ingest mcp-batch.jsonl via ingest-mcp-jsonl, then remove the file. */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BATCH = path.join(ROOT, "src/data/.clickup-cache-build/mcp-batch.jsonl");
const ingest = path.join(__dirname, "ingest-mcp-jsonl.mjs");

if (!fs.existsSync(BATCH)) {
  console.log(JSON.stringify({ ingested: 0, reason: "no batch file" }));
  process.exit(0);
}
const text = fs.readFileSync(BATCH, "utf8");
const lines = text.trim().split("\n").filter(Boolean);
const r = spawnSync("node", [ingest], { cwd: ROOT, input: text, encoding: "utf8" });
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
fs.unlinkSync(BATCH);
console.log(JSON.stringify({ lines: lines.length }));
