/** Save MCP filter payload: node save-mcp-payload.mjs <outPath>  (stdin JSON) */
import fs from "fs";

const outPath = process.argv[2];
if (!outPath) {
  console.error("Usage: save-mcp-payload.mjs <outPath>");
  process.exit(1);
}
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
fs.mkdirSync(require("path").dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, Buffer.concat(chunks));
console.log(`Wrote ${outPath}`);
