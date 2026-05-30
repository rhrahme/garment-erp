/** Read full MCP get_task JSON from stdin; emit compact normalized task JSON to stdout. */
import { normalizeTask } from "./build-clickup-import-cache.mjs";

const KEY_FIELDS = new Set([
  "Composition",
  "Fabric Number",
  "Unit",
  "Color",
  "Item",
  "Fabric Brand",
  "Cutting",
  "Size",
  "Tailor",
  "Brands",
]);

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const task = JSON.parse(Buffer.concat(chunks).toString("utf8"));
if (!task?.id) {
  console.error("Missing task.id");
  process.exit(1);
}
const compact = normalizeTask(task, task.list);
if (task.custom_fields?.length) {
  compact.custom_fields = task.custom_fields
    .filter((f) => KEY_FIELDS.has(f.name) && f.value !== undefined && f.value !== null && f.value !== "")
    .map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      ...(f.value !== undefined ? { value: f.value } : {}),
    }));
}
process.stdout.write(`${JSON.stringify(compact)}\n`);
