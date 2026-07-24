import { notifyIntegration } from "@/lib/integrations";
import { readPatternLibraryFresh, writePatternLibrary } from "@/lib/data/pattern-library";
import { generatePatternRef } from "@/lib/pattern-library/refs";
import type {
  BasePattern,
  BasePatternPoint,
  ClientPattern,
  ClientPatternMeasurement,
  ClientPatternVersion,
  MeasurementPointDef,
  MeasurementUnit,
  PatternLibraryAttachment,
} from "@/lib/types/pattern-library";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; status: number; error: string };

const VALID_UNITS: MeasurementUnit[] = ["in", "cm"];

function now(): string {
  return new Date().toISOString();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizePoint(point: Partial<BasePatternPoint>, sizes: string[]): BasePatternPoint {
  const name = (point.name ?? "").trim();
  const values: Record<string, number | null> = {};
  for (const size of sizes) {
    const raw = point.values?.[size];
    values[size] = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
  return {
    point_id: point.point_id?.trim() || slugify(name),
    name,
    remark: point.remark?.toString().trim() || null,
    is_graded: point.is_graded !== false,
    tolerance: typeof point.tolerance === "number" ? point.tolerance : null,
    grading_increment:
      typeof point.grading_increment === "number" ? point.grading_increment : null,
    diagram_code: point.diagram_code?.toString().trim() || null,
    values,
  };
}

export interface BasePatternInput {
  house_brand_id: string;
  house_brand_code: string;
  cut_family: string;
  garment_type: string;
  cut_variant?: string | null;
  name?: string | null;
  unit?: MeasurementUnit;
  sizes?: string[];
  points?: Partial<BasePatternPoint>[];
  style_code?: string | null;
  fabric?: string | null;
  season?: string | null;
  special_instructions?: string | null;
  physical_pattern_kept?: boolean;
  physical_pattern_location?: string | null;
  notes?: string | null;
}

export async function createBasePattern(
  input: BasePatternInput,
  options: { createdBy?: string | null; notify?: boolean } = {}
): Promise<Ok<{ base: BasePattern }> | Err> {
  const cutFamily = input.cut_family?.trim();
  const garment = input.garment_type?.trim().toLowerCase();
  if (!input.house_brand_id?.trim() || !input.house_brand_code?.trim()) {
    return { ok: false, status: 400, error: "house_brand_id and house_brand_code are required." };
  }
  if (!cutFamily || !garment) {
    return { ok: false, status: 400, error: "cut_family and garment_type are required." };
  }
  const unit = input.unit && VALID_UNITS.includes(input.unit) ? input.unit : "in";
  const sizes = (input.sizes ?? []).map((size) => size.trim()).filter(Boolean);
  const variant = input.cut_variant?.trim() || null;

  const store = await readPatternLibraryFresh();
  const timestamp = now();
  const base: BasePattern = {
    id: `bp-${Date.now()}-${store.base_patterns.length + 1}`,
    house_brand_id: input.house_brand_id.trim(),
    house_brand_code: input.house_brand_code.trim().toUpperCase(),
    cut_family: cutFamily,
    garment_type: garment,
    cut_variant: variant,
    name:
      input.name?.trim() ||
      [cutFamily, garment, variant ? `(${variant})` : null].filter(Boolean).join(" "),
    unit,
    sizes,
    points: (input.points ?? []).map((point) => sanitizePoint(point, sizes)).filter((p) => p.name),
    style_code: input.style_code?.trim() || null,
    fabric: input.fabric?.trim() || null,
    season: input.season?.trim() || null,
    special_instructions: input.special_instructions?.trim() || null,
    physical_pattern_kept: Boolean(input.physical_pattern_kept),
    physical_pattern_location: input.physical_pattern_location?.trim() || null,
    files: [],
    source_file: null,
    notes: input.notes?.trim() || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  store.base_patterns.push(base);
  await writePatternLibrary(store);

  if (options.notify !== false) {
    await notifyIntegration("base_pattern.created", {
      id: base.id,
      house_brand_code: base.house_brand_code,
      cut_family: base.cut_family,
      garment_type: base.garment_type,
      cut_variant: base.cut_variant,
      sizes: base.sizes,
      created_by: options.createdBy ?? null,
    });
  }

  return { ok: true, base };
}

export async function updateBasePattern(
  baseId: string,
  patch: Partial<BasePatternInput>,
  options: { updatedBy?: string | null; notify?: boolean } = {}
): Promise<Ok<{ base: BasePattern }> | Err> {
  const store = await readPatternLibraryFresh();
  const index = store.base_patterns.findIndex((base) => base.id === baseId);
  if (index < 0) return { ok: false, status: 404, error: "Base pattern not found." };

  const existing = store.base_patterns[index]!;
  const sizes = patch.sizes
    ? patch.sizes.map((size) => size.trim()).filter(Boolean)
    : existing.sizes;
  const next: BasePattern = {
    ...existing,
    house_brand_id: patch.house_brand_id?.trim() || existing.house_brand_id,
    house_brand_code: patch.house_brand_code?.trim().toUpperCase() || existing.house_brand_code,
    cut_family: patch.cut_family?.trim() || existing.cut_family,
    garment_type: patch.garment_type?.trim().toLowerCase() || existing.garment_type,
    cut_variant:
      patch.cut_variant === undefined ? existing.cut_variant : patch.cut_variant?.trim() || null,
    name: patch.name?.trim() || existing.name,
    unit: patch.unit && VALID_UNITS.includes(patch.unit) ? patch.unit : existing.unit,
    sizes,
    points: patch.points
      ? patch.points.map((point) => sanitizePoint(point, sizes)).filter((p) => p.name)
      : existing.points.map((point) => sanitizePoint(point, sizes)),
    style_code: patch.style_code === undefined ? existing.style_code : patch.style_code?.trim() || null,
    fabric: patch.fabric === undefined ? existing.fabric : patch.fabric?.trim() || null,
    season: patch.season === undefined ? existing.season : patch.season?.trim() || null,
    special_instructions:
      patch.special_instructions === undefined
        ? existing.special_instructions
        : patch.special_instructions?.trim() || null,
    physical_pattern_kept:
      patch.physical_pattern_kept === undefined
        ? existing.physical_pattern_kept
        : Boolean(patch.physical_pattern_kept),
    physical_pattern_location:
      patch.physical_pattern_location === undefined
        ? existing.physical_pattern_location
        : patch.physical_pattern_location?.trim() || null,
    notes: patch.notes === undefined ? existing.notes : patch.notes?.trim() || null,
    updated_at: now(),
  };

  store.base_patterns[index] = next;
  await writePatternLibrary(store);

  if (options.notify !== false) {
    await notifyIntegration("base_pattern.updated", {
      id: next.id,
      house_brand_code: next.house_brand_code,
      cut_family: next.cut_family,
      garment_type: next.garment_type,
      cut_variant: next.cut_variant,
      updated_by: options.updatedBy ?? null,
    });
  }

  return { ok: true, base: next };
}

export async function attachBasePatternFile(
  baseId: string,
  file: PatternLibraryAttachment
): Promise<Ok<{ base: BasePattern }> | Err> {
  const store = await readPatternLibraryFresh();
  const index = store.base_patterns.findIndex((base) => base.id === baseId);
  if (index < 0) return { ok: false, status: 404, error: "Base pattern not found." };
  const next = {
    ...store.base_patterns[index]!,
    files: [...store.base_patterns[index]!.files, file],
    updated_at: now(),
  };
  store.base_patterns[index] = next;
  await writePatternLibrary(store);
  return { ok: true, base: next };
}

function buildMeasurementsFromBase(base: BasePattern, size: string): ClientPatternMeasurement[] {
  return base.points.map((point) => {
    const graded = point.is_graded;
    // Trim points render once — take the first documented value when the exact size is empty.
    const fallback = graded
      ? null
      : Object.values(point.values).find((value) => value !== null) ?? null;
    const baseValue = point.values[size] ?? fallback;
    return {
      point_id: point.point_id,
      name: point.name,
      remark: point.remark,
      is_graded: graded,
      base_value: baseValue,
      target_value: baseValue,
      sewn_value: null,
      adjustment: null,
      remarks: null,
    };
  });
}

/**
 * Pre-made measurement template for a garment type — the dictionary points seen
 * on that garment (from imports + past patterns), as empty rows to fill in.
 */
function buildMeasurementsFromTemplate(
  dictionary: MeasurementPointDef[],
  garmentType: string
): ClientPatternMeasurement[] {
  const garment = garmentType.trim().toLowerCase();
  return dictionary
    .filter((point) => point.garment_types.includes(garment))
    .map((point) => ({
      point_id: point.id,
      name: point.name,
      remark: null,
      is_graded: true,
      base_value: null,
      target_value: null,
      sewn_value: null,
      adjustment: null,
      remarks: null,
    }));
}

function sanitizeMeasurement(row: Partial<ClientPatternMeasurement>): ClientPatternMeasurement {
  const name = (row.name ?? "").trim();
  const num = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  return {
    point_id: row.point_id?.trim() || slugify(name),
    name,
    remark: row.remark?.toString().trim() || null,
    is_graded: row.is_graded !== false,
    base_value: num(row.base_value),
    target_value: num(row.target_value),
    sewn_value: num(row.sewn_value),
    adjustment: num(row.adjustment),
    remarks: row.remarks?.toString().trim() || null,
  };
}

export interface ClientPatternInput {
  client_id: string;
  client_code: string;
  client_name: string;
  garment_type: string;
  description?: string | null;
  base_pattern_id?: string | null;
  base_size?: string | null;
  fabric?: string | null;
  pattern_ref?: string | null;
  unit?: MeasurementUnit;
  special_instructions?: string | null;
  physical_pattern_kept?: boolean;
  physical_pattern_location?: string | null;
  notes?: string | null;
  trial_date?: string | null;
}

export async function createClientPattern(
  input: ClientPatternInput,
  options: { createdBy?: string | null; notify?: boolean } = {}
): Promise<Ok<{ pattern: ClientPattern }> | Err> {
  if (!input.client_id?.trim() || !input.garment_type?.trim()) {
    return { ok: false, status: 400, error: "client_id and garment_type are required." };
  }

  const store = await readPatternLibraryFresh();
  const base = input.base_pattern_id
    ? store.base_patterns.find((candidate) => candidate.id === input.base_pattern_id) ?? null
    : null;
  if (input.base_pattern_id && !base) {
    return { ok: false, status: 400, error: "Base pattern not found." };
  }
  const baseSize = input.base_size?.trim() || null;
  if (base && baseSize && !base.sizes.includes(baseSize)) {
    return { ok: false, status: 400, error: `Size ${baseSize} is not on base pattern ${base.name}.` };
  }

  const timestamp = now();
  const unit = input.unit && VALID_UNITS.includes(input.unit) ? input.unit : base?.unit ?? "in";
  // Base + size copies the graded values; otherwise the garment-type template
  // pre-fills the point list so the team never starts from a blank grid.
  const measurements =
    base && baseSize
      ? buildMeasurementsFromBase(base, baseSize)
      : buildMeasurementsFromTemplate(store.dictionary, input.garment_type);
  const version: ClientPatternVersion = {
    id: `cpv-${Date.now()}-1`,
    version: 1,
    is_final: false,
    trial_date: input.trial_date?.trim() || null,
    measurements,
    special_instructions: null,
    notes: null,
    files: [],
    created_by: options.createdBy ?? null,
    updated_by: options.createdBy ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const patternRef =
    input.pattern_ref?.trim() ||
    generatePatternRef({
      cut_family: base?.cut_family ?? null,
      garment_type: input.garment_type,
      fabric: input.fabric ?? base?.fabric ?? null,
      house_brand_code: base?.house_brand_code ?? null,
      cut_variant: base?.cut_variant ?? null,
      size: baseSize,
    });

  const pattern: ClientPattern = {
    id: `cp-${Date.now()}-${store.client_patterns.length + 1}`,
    pattern_ref: patternRef,
    client_id: input.client_id.trim(),
    client_code: input.client_code?.trim() ?? "",
    client_name: input.client_name?.trim() ?? "",
    garment_type: input.garment_type.trim().toLowerCase(),
    description: input.description?.trim() || null,
    base_pattern_id: base?.id ?? null,
    base_size: baseSize,
    house_brand_id: base?.house_brand_id ?? null,
    house_brand_code: base?.house_brand_code ?? null,
    fabric: input.fabric?.trim() || base?.fabric || null,
    unit,
    versions: [version],
    final_version_id: null,
    special_instructions: input.special_instructions?.trim() || null,
    physical_pattern_kept: Boolean(input.physical_pattern_kept),
    physical_pattern_location: input.physical_pattern_location?.trim() || null,
    files: [],
    notes: input.notes?.trim() || null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  store.client_patterns.push(pattern);
  await writePatternLibrary(store);

  if (options.notify !== false) {
    await notifyIntegration("client_pattern.created", {
      id: pattern.id,
      pattern_ref: pattern.pattern_ref,
      client_id: pattern.client_id,
      client_code: pattern.client_code,
      garment_type: pattern.garment_type,
      base_pattern_id: pattern.base_pattern_id,
      base_size: pattern.base_size,
      created_by: options.createdBy ?? null,
    });
  }

  return { ok: true, pattern };
}

export async function updateClientPattern(
  patternId: string,
  patch: Partial<
    Pick<
      ClientPattern,
      | "pattern_ref"
      | "description"
      | "fabric"
      | "special_instructions"
      | "physical_pattern_kept"
      | "physical_pattern_location"
      | "notes"
      | "base_pattern_id"
      | "base_size"
      | "garment_type"
    >
  >,
  options: { updatedBy?: string | null; notify?: boolean } = {}
): Promise<Ok<{ pattern: ClientPattern }> | Err> {
  const store = await readPatternLibraryFresh();
  const index = store.client_patterns.findIndex((pattern) => pattern.id === patternId);
  if (index < 0) return { ok: false, status: 404, error: "Client pattern not found." };

  const existing = store.client_patterns[index]!;
  let base = existing.base_pattern_id
    ? store.base_patterns.find((candidate) => candidate.id === existing.base_pattern_id) ?? null
    : null;
  if (patch.base_pattern_id !== undefined) {
    base = patch.base_pattern_id
      ? store.base_patterns.find((candidate) => candidate.id === patch.base_pattern_id) ?? null
      : null;
    if (patch.base_pattern_id && !base) {
      return { ok: false, status: 400, error: "Base pattern not found." };
    }
  }

  const next: ClientPattern = {
    ...existing,
    pattern_ref: patch.pattern_ref?.trim() || existing.pattern_ref,
    description:
      patch.description === undefined ? existing.description : patch.description?.trim() || null,
    garment_type: patch.garment_type?.trim().toLowerCase() || existing.garment_type,
    fabric: patch.fabric === undefined ? existing.fabric : patch.fabric?.trim() || null,
    base_pattern_id: patch.base_pattern_id === undefined ? existing.base_pattern_id : base?.id ?? null,
    base_size: patch.base_size === undefined ? existing.base_size : patch.base_size?.trim() || null,
    house_brand_id:
      patch.base_pattern_id === undefined ? existing.house_brand_id : base?.house_brand_id ?? null,
    house_brand_code:
      patch.base_pattern_id === undefined ? existing.house_brand_code : base?.house_brand_code ?? null,
    special_instructions:
      patch.special_instructions === undefined
        ? existing.special_instructions
        : patch.special_instructions?.trim() || null,
    physical_pattern_kept:
      patch.physical_pattern_kept === undefined
        ? existing.physical_pattern_kept
        : Boolean(patch.physical_pattern_kept),
    physical_pattern_location:
      patch.physical_pattern_location === undefined
        ? existing.physical_pattern_location
        : patch.physical_pattern_location?.trim() || null,
    notes: patch.notes === undefined ? existing.notes : patch.notes?.trim() || null,
    updated_at: now(),
  };

  store.client_patterns[index] = next;
  await writePatternLibrary(store);

  if (options.notify !== false) {
    await notifyIntegration("client_pattern.updated", {
      id: next.id,
      pattern_ref: next.pattern_ref,
      client_id: next.client_id,
      garment_type: next.garment_type,
      updated_by: options.updatedBy ?? null,
    });
  }

  return { ok: true, pattern: next };
}

/** Adds the next trial: targets roll forward as previous target + adjustment. */
export async function addClientPatternVersion(
  patternId: string,
  input: { trial_date?: string | null; notes?: string | null } = {},
  options: { createdBy?: string | null; notify?: boolean } = {}
): Promise<Ok<{ pattern: ClientPattern; version: ClientPatternVersion }> | Err> {
  const store = await readPatternLibraryFresh();
  const index = store.client_patterns.findIndex((pattern) => pattern.id === patternId);
  if (index < 0) return { ok: false, status: 404, error: "Client pattern not found." };

  const existing = store.client_patterns[index]!;
  const previous = existing.versions[existing.versions.length - 1] ?? null;
  const timestamp = now();
  const versionNumber = existing.versions.length + 1;
  const measurements: ClientPatternMeasurement[] = (previous?.measurements ?? []).map((row) => ({
    ...row,
    target_value:
      row.target_value !== null && row.adjustment !== null && row.adjustment !== 0
        ? Math.round((row.target_value + row.adjustment) * 1000) / 1000
        : row.target_value,
    sewn_value: null,
    adjustment: null,
  }));

  const version: ClientPatternVersion = {
    id: `cpv-${Date.now()}-${versionNumber}`,
    version: versionNumber,
    is_final: false,
    trial_date: input.trial_date?.trim() || null,
    measurements,
    special_instructions: previous?.special_instructions ?? null,
    notes: input.notes?.trim() || null,
    files: [],
    created_by: options.createdBy ?? null,
    updated_by: options.createdBy ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const next: ClientPattern = {
    ...existing,
    versions: [...existing.versions, version],
    updated_at: timestamp,
  };
  store.client_patterns[index] = next;
  await writePatternLibrary(store);

  if (options.notify !== false) {
    await notifyIntegration("client_pattern.trial_added", {
      id: next.id,
      pattern_ref: next.pattern_ref,
      version_id: version.id,
      version: version.version,
      trial_date: version.trial_date,
      created_by: options.createdBy ?? null,
    });
  }

  return { ok: true, pattern: next, version };
}

export async function updateClientPatternVersion(
  patternId: string,
  versionId: string,
  patch: {
    measurements?: Partial<ClientPatternMeasurement>[];
    trial_date?: string | null;
    special_instructions?: string | null;
    notes?: string | null;
  },
  options: { updatedBy?: string | null; notify?: boolean } = {}
): Promise<Ok<{ pattern: ClientPattern; version: ClientPatternVersion }> | Err> {
  const store = await readPatternLibraryFresh();
  const index = store.client_patterns.findIndex((pattern) => pattern.id === patternId);
  if (index < 0) return { ok: false, status: 404, error: "Client pattern not found." };

  const existing = store.client_patterns[index]!;
  const versionIndex = existing.versions.findIndex((version) => version.id === versionId);
  if (versionIndex < 0) return { ok: false, status: 404, error: "Version not found." };

  const previous = existing.versions[versionIndex]!;
  const version: ClientPatternVersion = {
    ...previous,
    measurements: patch.measurements
      ? patch.measurements.map(sanitizeMeasurement).filter((row) => row.name)
      : previous.measurements,
    trial_date:
      patch.trial_date === undefined ? previous.trial_date : patch.trial_date?.trim() || null,
    special_instructions:
      patch.special_instructions === undefined
        ? previous.special_instructions
        : patch.special_instructions?.trim() || null,
    notes: patch.notes === undefined ? previous.notes : patch.notes?.trim() || null,
    updated_by: options.updatedBy ?? previous.updated_by,
    updated_at: now(),
  };

  const next: ClientPattern = {
    ...existing,
    versions: existing.versions.map((candidate, i) => (i === versionIndex ? version : candidate)),
    updated_at: version.updated_at,
  };
  store.client_patterns[index] = next;
  await writePatternLibrary(store);

  if (options.notify !== false) {
    await notifyIntegration("client_pattern.updated", {
      id: next.id,
      pattern_ref: next.pattern_ref,
      version_id: version.id,
      version: version.version,
      updated_by: options.updatedBy ?? null,
    });
  }

  return { ok: true, pattern: next, version };
}

export async function finalizeClientPatternVersion(
  patternId: string,
  versionId: string,
  options: { finalizedBy?: string | null; notify?: boolean; final?: boolean } = {}
): Promise<Ok<{ pattern: ClientPattern; version: ClientPatternVersion }> | Err> {
  const store = await readPatternLibraryFresh();
  const index = store.client_patterns.findIndex((pattern) => pattern.id === patternId);
  if (index < 0) return { ok: false, status: 404, error: "Client pattern not found." };

  const existing = store.client_patterns[index]!;
  const target = existing.versions.find((version) => version.id === versionId);
  if (!target) return { ok: false, status: 404, error: "Version not found." };

  const makeFinal = options.final !== false;
  const timestamp = now();
  const next: ClientPattern = {
    ...existing,
    versions: existing.versions.map((version) => ({
      ...version,
      is_final: makeFinal && version.id === versionId,
      updated_at: version.id === versionId ? timestamp : version.updated_at,
    })),
    final_version_id: makeFinal ? versionId : null,
    updated_at: timestamp,
  };
  store.client_patterns[index] = next;
  await writePatternLibrary(store);

  const version = next.versions.find((candidate) => candidate.id === versionId)!;
  if (options.notify !== false && makeFinal) {
    await notifyIntegration("client_pattern.finalized", {
      id: next.id,
      pattern_ref: next.pattern_ref,
      version_id: version.id,
      version: version.version,
      finalized_by: options.finalizedBy ?? null,
    });
  }

  return { ok: true, pattern: next, version };
}

export async function attachClientPatternFile(
  patternId: string,
  versionId: string | null,
  file: PatternLibraryAttachment
): Promise<Ok<{ pattern: ClientPattern }> | Err> {
  const store = await readPatternLibraryFresh();
  const index = store.client_patterns.findIndex((pattern) => pattern.id === patternId);
  if (index < 0) return { ok: false, status: 404, error: "Client pattern not found." };

  const existing = store.client_patterns[index]!;
  let next: ClientPattern;
  if (versionId) {
    const versionIndex = existing.versions.findIndex((version) => version.id === versionId);
    if (versionIndex < 0) return { ok: false, status: 404, error: "Version not found." };
    next = {
      ...existing,
      versions: existing.versions.map((version, i) =>
        i === versionIndex ? { ...version, files: [...version.files, file], updated_at: now() } : version
      ),
      updated_at: now(),
    };
  } else {
    next = { ...existing, files: [...existing.files, file], updated_at: now() };
  }

  store.client_patterns[index] = next;
  await writePatternLibrary(store);
  return { ok: true, pattern: next };
}
