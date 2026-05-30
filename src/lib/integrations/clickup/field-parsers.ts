import type { ClickUpCustomField } from "./types";

function dropdownLabel(field: ClickUpCustomField): string | null {
  const value = field.value;
  if (value == null || value === "") return null;

  const options = field.type_config?.options ?? [];
  if (typeof value === "number") {
    const byIndex = options.find((opt) => opt.orderindex === value);
    if (byIndex) return byIndex.name;
    const byPos = options[value];
    if (byPos) return byPos.name;
  }

  if (typeof value === "object" && value !== null && "name" in value) {
    return String((value as { name: string }).name);
  }

  const byId = options.find((opt) => opt.id === value);
  return byId?.name ?? null;
}

function labelsValue(field: ClickUpCustomField): string[] {
  const value = field.value;
  if (!Array.isArray(value)) return [];
  const options = field.type_config?.options ?? [];
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return options.find((opt) => opt.id === entry)?.label ?? options.find((opt) => opt.id === entry)?.name ?? null;
      }
      return null;
    })
    .filter((label): label is string => Boolean(label));
}

function textValue(field: ClickUpCustomField): string | null {
  const value = field.value;
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function numberValue(field: ClickUpCustomField): number | null {
  const value = field.value;
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function dateValue(field: ClickUpCustomField): string | null {
  const value = field.value;
  if (value == null || value === "") return null;
  const ms = Number(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function getCustomField(fields: ClickUpCustomField[] | undefined, name: string): ClickUpCustomField | undefined {
  return fields?.find((field) => field.name.trim().toLowerCase() === name.trim().toLowerCase());
}

export function getDropdown(fields: ClickUpCustomField[] | undefined, name: string): string | null {
  const field = getCustomField(fields, name);
  if (!field) return null;
  return dropdownLabel(field);
}

export function getText(fields: ClickUpCustomField[] | undefined, name: string): string | null {
  const field = getCustomField(fields, name);
  if (!field) return null;
  return textValue(field);
}

export function getNumber(fields: ClickUpCustomField[] | undefined, name: string): number | null {
  const field = getCustomField(fields, name);
  if (!field) return null;
  return numberValue(field);
}

export function getDate(fields: ClickUpCustomField[] | undefined, name: string): string | null {
  const field = getCustomField(fields, name);
  if (!field) return null;
  return dateValue(field);
}

export function getLabels(fields: ClickUpCustomField[] | undefined, name: string): string[] {
  const field = getCustomField(fields, name);
  if (!field) return [];
  return labelsValue(field);
}

/** Parse "Received-12/04/2026" style Ordered dropdown into ISO date when possible */
export function parseOrderedReceivedDate(ordered: string | null): string | null {
  if (!ordered) return null;
  const match = ordered.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  let year = match[3];
  if (year.length === 2) year = `20${year}`;
  return `${year}-${month}-${day}`;
}
