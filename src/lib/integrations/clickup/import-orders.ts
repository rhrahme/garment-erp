import fs from "fs";
import path from "path";
import { generateNextClientCode, getJoinMonthYear } from "../../clients/codes";
import { slugifyClientId } from "../../data/clients";
import { buildClientReference, generateSoNumber } from "../../data/sales-orders";
import { formatClientDisplayName } from "../../clients/names";
import { generateFabricLabelStickers } from "../../sales-orders/label-codes";
import { findOpenOrderWithOverlappingArticle as findOpenOrderWithSameArticle } from "../../sales-orders/duplicate-order";
import { resolveClickUpListMapping } from "./list-stage-mapping";
import { parseClickUpClientName } from "./client-name";
import {
  getDate,
  getDropdown,
  getNumber,
  getText,
  parseOrderedReceivedDate,
} from "./field-parsers";
import {
  mapClickUpBrand,
  mapClickUpItemToGarmentType,
  mapClickUpSupplier,
  normalizeFabricNumber,
} from "./mappings";
import {
  groupLineTasksByOrderRoot,
  indexClickUpTasks,
  isClickUpLineTask,
} from "./task-tree";
import {
  parseReadyMadeRoot,
  readyMadeGroupKey,
  retailBrandClientId,
  type ParsedReadyMadeRoot,
} from "./ready-made-brands";
import type { ClickUpImportResult, ClickUpTask } from "./types";
import type { ClientProfile, ClientsFile } from "../../types/clients";
import type { ProductionStage, ProductionWorkOrder, ProductionWorkOrdersFile } from "../../types/production";
import type { SalesOrder, SalesOrderFabricLine, SalesOrdersFile } from "../../types/sales-orders";
import { prepareClientsForPersist } from "../../clients/orphan-reconciliation";

export interface ImportClickUpOptions {
  reset?: boolean;
}

/** ClickUp order roots that should never become ERP clients (templates / placeholders). */
export const CLICKUP_IMPORT_SKIP_ROOT_IDS = new Set([
  "86ew340p0", // Delivery - [Client Name] - [Product Name]
  "86et8xkxt", // client CCDDEE
]);

function shouldSkipClickUpImportRoot(rootIds: string[], rootNames: string[]): boolean {
  if (rootIds.some((id) => CLICKUP_IMPORT_SKIP_ROOT_IDS.has(id))) return true;
  const name = rootNames[0]?.trim() ?? "";
  if (/^Delivery - \[Client Name\]/i.test(name)) return true;
  if (/^client CCDDEE$/i.test(name)) return true;
  return false;
}

function msToIsoDate(ms: string | undefined): string {
  if (!ms) return new Date().toISOString().slice(0, 10);
  const n = Number(ms);
  if (!Number.isFinite(n)) return new Date().toISOString().slice(0, 10);
  return new Date(n).toISOString().slice(0, 10);
}

function clientKey(name: string, brandId: string): string {
  return `${name.trim().toLowerCase()}::${brandId}`;
}

function resolveBrandFromTask(task: ClickUpTask, fallbackName: string): string {
  const fromField = mapClickUpBrand(getDropdown(task.custom_fields, "Brands"));
  if (fromField) return fromField;

  const item = getDropdown(task.custom_fields, "Item") ?? "";
  if (/\(FR\)/i.test(item)) return "fouad-rahme";
  if (/\(FD\)/i.test(item)) return "fouad";
  if (/\(JU\)/i.test(item)) return "just-uniforms";
  if (/\(G\)/i.test(item) || /\(GL\)/i.test(item)) return "gliani";

  return "fouad-rahme";
}

function buildFabricLine(
  subtask: ClickUpTask,
  clientReference: string,
  lineIndex: number
): SalesOrderFabricLine | null {
  const garment_type = mapClickUpItemToGarmentType(getDropdown(subtask.custom_fields, "Item"));
  const fabric_number = normalizeFabricNumber(getText(subtask.custom_fields, "Fabric Number"));
  const supplier = mapClickUpSupplier(getDropdown(subtask.custom_fields, "Fabric Brand"));
  const quantity = getNumber(subtask.custom_fields, "Unit") ?? 1;

  if (!fabric_number && !getDropdown(subtask.custom_fields, "Item")) {
    return null;
  }

  const label_stickers = generateFabricLabelStickers(clientReference, lineIndex, garment_type);
  const pieceName = getDropdown(subtask.custom_fields, "Item") ?? garment_type;

  return {
    id: `line-cu-${subtask.id}`,
    garment_type,
    label_count: label_stickers.length,
    label_stickers: label_stickers.map((sticker) => ({
      ...sticker,
      piece_name: pieceName.split("(")[0].trim() || sticker.piece_name,
    })),
    supplier_id: supplier?.id ?? "unknown",
    supplier_name: supplier?.name ?? "Unknown",
    fabric_number: fabric_number || "TBD",
    quantity,
    unit: "meters",
    unit_price: 0,
    composition: getText(subtask.custom_fields, "Composition"),
    weight_gsm: getNumber(subtask.custom_fields, "Weight (grms)"),
    width_cm: null,
    width_inches: null,
    color: getDropdown(subtask.custom_fields, "Color"),
    added_at: new Date().toISOString(),
    added_by: null,
    a4_printed_at: null,
    prep_stickers_printed_at: null,
    prod_stickers_printed_at: null,
  };
}

function productionStageForList(listId: string | undefined, listName?: string): ProductionStage | null {
  if (!listId) return null;
  return resolveClickUpListMapping(listId, listName)?.erp_production_stage ?? null;
}

interface ImportLineGroup {
  lineTasks: ClickUpTask[];
  rootIds: string[];
  rootNames: string[];
  readyMade: ParsedReadyMadeRoot | null;
}

function consolidateImportLineGroups(
  lineGroups: Map<string, ClickUpTask[]>,
  byId: Map<string, ClickUpTask>
): Map<string, ImportLineGroup> {
  const consolidated = new Map<string, ImportLineGroup>();

  for (const [rootId, lineTasks] of lineGroups) {
    const root =
      byId.get(rootId) ??
      ({
        id: rootId,
        name: lineTasks[0]?.name ?? `Order ${rootId}`,
      } satisfies ClickUpTask);

    const readyMade = parseReadyMadeRoot(root.name);
    const key = readyMade ? readyMadeGroupKey(root.name)! : rootId;

    const bucket = consolidated.get(key) ?? {
      lineTasks: [],
      rootIds: [],
      rootNames: [],
      readyMade: readyMade ?? null,
    };

    bucket.lineTasks.push(...lineTasks);
    if (!bucket.rootIds.includes(rootId)) {
      bucket.rootIds.push(rootId);
      bucket.rootNames.push(root.name);
    }
    if (readyMade && !bucket.readyMade) bucket.readyMade = readyMade;
    consolidated.set(key, bucket);
  }

  return consolidated;
}

function getOrCreateRetailBrandClient(
  parsed: ParsedReadyMadeRoot,
  factoryBrandId: string,
  clients: ClientProfile[]
): ClientProfile {
  const id = retailBrandClientId(parsed.brand.id);
  let client = clients.find((row) => row.id === id);
  if (!client) {
    client = {
      id,
      code: parsed.brand.client_code,
      joined_at: new Date().toISOString(),
      first_name: parsed.brand.label,
      middle_name: null,
      last_name: "Ready-Made",
      brand_ids: [factoryBrandId],
      contact_person: null,
      referred_by_first_name: null,
      referred_by_middle_name: null,
      referred_by_last_name: null,
      email: null,
      phone: null,
      country: null,
      city: null,
      address: null,
      payment_terms: null,
      client_reference_prefix: null,
      notes: "Ready-made retail brand — production tracked by garment article on each order",
      is_active: true,
      client_kind: "retail_brand",
    };
    clients.push(client);
  } else if (!client.brand_ids.includes(factoryBrandId)) {
    client.brand_ids.push(factoryBrandId);
  }
  return client;
}

function importOrderId(group: ImportLineGroup): string {
  if (group.readyMade) {
    const slug = group.readyMade.article
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
    return `so-cu-rm-${group.readyMade.brand.id}-${slug}`;
  }
  return `so-cu-${group.rootIds[0]}`;
}

export function importClickUpTasks(
  tasks: ClickUpTask[],
  options: ImportClickUpOptions = {}
): {
  clients: ClientsFile;
  sales_orders: SalesOrdersFile;
  production_work_orders: ProductionWorkOrdersFile;
  result: ClickUpImportResult;
} {
  const warnings: string[] = [];
  const clients: ClientProfile[] = options.reset ? [] : [];
  const orders: SalesOrder[] = options.reset ? [] : [];
  const workOrders: ProductionWorkOrder[] = options.reset ? [] : [];

  const byId = indexClickUpTasks(tasks);
  const allTasks = [...byId.values()];
  const lineGroups = consolidateImportLineGroups(groupLineTasksByOrderRoot(allTasks, byId), byId);

  const clientByKey = new Map<string, ClientProfile>();
  for (const client of clients) {
    for (const brandId of client.brand_ids) {
      clientByKey.set(clientKey(formatClientDisplayName(client), brandId), client);
    }
  }

  let skipped = 0;

  for (const [groupKey, group] of lineGroups) {
    const { lineTasks, rootIds, rootNames, readyMade } = group;
    const primaryRootId = rootIds[0];

    if (shouldSkipClickUpImportRoot(rootIds, rootNames)) {
      skipped += 1;
      continue;
    }

    if (rootIds.some((rootId) => !byId.has(rootId))) {
      warnings.push(`Order root(s) ${rootIds.join(", ")} not in fetch — using line task metadata`);
    }

    const lines: SalesOrderFabricLine[] = [];
    for (const lineTask of lineTasks) {
      const placeholderRef = readyMade ? `RM-${groupKey}` : `CU-${primaryRootId}`;
      const line = buildFabricLine(lineTask, placeholderRef, lines.length + 1);
      if (line) lines.push(line);
    }

    if (lines.length === 0) {
      skipped += 1;
      continue;
    }

    const brandId = resolveBrandFromTask(lineTasks[0], rootNames[0] ?? "");
    let client: ClientProfile;

    if (readyMade) {
      client = getOrCreateRetailBrandClient(readyMade, brandId, clients);
    } else {
      const rootName = rootNames[0] ?? lineTasks[0]?.name ?? `Order ${primaryRootId}`;
      const parsedName = parseClickUpClientName(rootName);
      const displayName = parsedName.is_group
        ? rootName.trim()
        : [parsedName.first_name, parsedName.middle_name, parsedName.last_name].filter(Boolean).join(" ");
      const key = clientKey(displayName, brandId);

      client = clientByKey.get(key)!;
      if (!client) {
        const rootTask = byId.get(primaryRootId);
        const joinedAt = new Date(msToIsoDate(rootTask?.date_created ?? lineTasks[0]?.date_created));
        const code =
          generateNextClientCode(clients, brandId, { joinedAt }) ??
          `CU-${getJoinMonthYear(joinedAt)}-${String(clients.length + 1).padStart(4, "0")}`;

        client = {
          id: `cu-${slugifyClientId(displayName)}-${brandId}`,
          code,
          joined_at: joinedAt.toISOString(),
          first_name: parsedName.first_name,
          middle_name: parsedName.middle_name,
          last_name: parsedName.last_name,
          brand_ids: [brandId],
          contact_person: null,
          referred_by_first_name: null,
          referred_by_middle_name: null,
          referred_by_last_name: null,
          email: null,
          phone: null,
          country: null,
          city: null,
          address: null,
          payment_terms: null,
          client_reference_prefix: null,
          notes: parsedName.is_group
            ? "Imported group order from ClickUp"
            : `Imported from ClickUp task ${primaryRootId}`,
          is_active: true,
          client_kind: "person",
        };
        clients.push(client);
        clientByKey.set(key, client);
      }
    }

    const orderId = importOrderId(group);
    if (orders.some((order) => order.id === orderId)) {
      warnings.push(`Skipping duplicate consolidated order ${orderId} (${rootNames.join("; ")})`);
      skipped += 1;
      continue;
    }

    const duplicateArticleOrder = lines
      .map((line) => findOpenOrderWithSameArticle(orders, client.id, line))
      .find((order): order is SalesOrder => order != null);
    if (duplicateArticleOrder) {
      const articleSummary = lines.map((line) => `${line.garment_type} ${line.fabric_number}`).join(", ");
      warnings.push(
        `Skipping ClickUp ${rootNames.join("; ")} — same article(s) already on ${duplicateArticleOrder.so_number} (${articleSummary})`
      );
      skipped += 1;
      continue;
    }

    const so_number = generateSoNumber(orders);
    const client_reference = buildClientReference(client.code, so_number);
    const rootTask = byId.get(primaryRootId);
    const order_date = msToIsoDate(rootTask?.date_created ?? lineTasks[0]?.date_created);
    const delivery_date =
      getDate(rootTask?.custom_fields, "Delivery date") ??
      getDate(lineTasks[0]?.custom_fields, "Delivery date") ??
      null;

    const fabric_lines = lines.map((line, index) => {
      const stickers = generateFabricLabelStickers(client_reference, index + 1, line.garment_type);
      return {
        ...line,
        id: `line-cu-${primaryRootId}-${index}`,
        label_stickers: stickers.map((sticker, stickerIndex) => ({
          ...sticker,
          piece_name: line.label_stickers[stickerIndex]?.piece_name ?? sticker.piece_name,
        })),
      };
    });

    const clickUpNote = rootNames.map((name, index) => `${name} (${rootIds[index]})`).join("; ");
    const order: SalesOrder = {
      id: orderId,
      so_number,
      client_id: client.id,
      client_code: client.code,
      client_name: readyMade ? readyMade.brand.label : formatClientDisplayName(client),
      client_reference,
      order_date,
      delivery_date,
      delivery_destination: null,
      status: "open",
      notes: readyMade
        ? `Ready-made · ${readyMade.article} · ClickUp: ${clickUpNote}`
        : `ClickUp: ${clickUpNote}`,
      fabric_lines,
      fabric_po_ids: [],
      retail_brand: readyMade?.brand.label ?? null,
      product_article: readyMade?.article ?? null,
    };
    orders.push(order);

    for (const [lineIndex, line] of fabric_lines.entries()) {
      const lineTask = lineTasks[lineIndex];
      if (!lineTask) continue;
      const stage = productionStageForList(lineTask.list?.id, lineTask.list?.name);
      if (!stage) continue;

      const receivedFromOrdered = parseOrderedReceivedDate(getDropdown(lineTask.custom_fields, "Ordered"));
      const received_at = receivedFromOrdered
        ? new Date(`${receivedFromOrdered}T12:00:00.000Z`).toISOString()
        : new Date(Number(lineTask.date_updated ?? lineTask.date_created ?? Date.now())).toISOString();

      for (const sticker of line.label_stickers) {
        workOrders.push({
          id: `pwo-cu-${lineTask.id}-${sticker.sequence}`,
          sticker_code: sticker.code,
          sales_order_id: order.id,
          so_number: order.so_number,
          sales_order_line_id: line.id,
          client_id: client.id,
          client_code: client.code,
          client_name: order.client_name,
          garment_type: line.garment_type,
          piece_name: sticker.piece_name,
          fabric_number: line.fabric_number,
          supplier_id: line.supplier_id,
          supplier_name: line.supplier_name,
          fabric_meters: line.quantity,
          status: stage,
          fabric_prep_type: null,
          fabric_prep_step: null,
          received_at,
          updated_at: new Date().toISOString(),
          completed_at: stage === "completed" ? received_at : null,
        });
      }
    }
  }

  const orphanLineCount = allTasks.filter(isClickUpLineTask).length;
  if (orphanLineCount === 0 && allTasks.length > 0) {
    warnings.push(
      "No line tasks found (Item/Fabric Number). Tasks may be missing custom_fields — re-fetch with include_subtasks."
    );
  }

  return {
    clients: { updated_at: new Date().toISOString(), clients },
    sales_orders: { updated_at: new Date().toISOString(), orders },
    production_work_orders: { updated_at: new Date().toISOString(), work_orders: workOrders },
    result: {
      clients: clients.length,
      sales_orders: orders.length,
      production_work_orders: workOrders.length,
      skipped_tasks: skipped,
      warnings,
    },
  };
}

export function applyClickUpImport(
  tasks: ClickUpTask[],
  options: ImportClickUpOptions = {}
): ClickUpImportResult {
  const { clients, sales_orders, production_work_orders, result } = importClickUpTasks(tasks, options);

  const writeJson = (relPath: string, data: unknown) => {
    const full = path.join(process.cwd(), relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  };

  // Never wipe existing client profiles. Union previous + imported, then retain/
  // heal against the sales orders this import persists so FR activity cannot
  // outlive a Clients row.
  const clientsPath = path.join(process.cwd(), "src/data/clients.json");
  let previousClients: ClientProfile[] = [];
  try {
    const existing = JSON.parse(fs.readFileSync(clientsPath, "utf8")) as ClientsFile;
    previousClients = Array.isArray(existing.clients) ? existing.clients : [];
  } catch {
    previousClients = [];
  }

  const byId = new Map(previousClients.map((client) => [client.id, client]));
  for (const client of clients.clients) {
    byId.set(client.id, client);
  }
  const prepared = prepareClientsForPersist(previousClients, [...byId.values()], sales_orders.orders);

  writeJson("src/data/clients.json", {
    updated_at: new Date().toISOString(),
    clients: prepared.clients,
  });
  writeJson("src/data/sales-orders.json", sales_orders);
  writeJson("src/data/production-work-orders.json", production_work_orders);
  writeJson("src/data/fabric-receipts.json", { updated_at: new Date().toISOString(), receipts: [] });

  return {
    ...result,
    clients: prepared.clients.length,
  };
}
