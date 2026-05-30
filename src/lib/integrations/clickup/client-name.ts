import { isGroupOrderName } from "./mappings";

export function parseClickUpClientName(name: string): {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  is_group: boolean;
} {
  const trimmed = name.trim();
  if (!trimmed) {
    return { first_name: "Unknown", middle_name: null, last_name: "Client", is_group: false };
  }

  if (isGroupOrderName(trimmed)) {
    return { first_name: trimmed, middle_name: null, last_name: "Group", is_group: true };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], middle_name: null, last_name: "Client", is_group: false };
  }
  if (parts.length === 2) {
    return { first_name: parts[0], middle_name: null, last_name: parts[1], is_group: false };
  }

  return {
    first_name: parts[0],
    middle_name: parts.slice(1, -1).join(" ") || null,
    last_name: parts[parts.length - 1],
    is_group: false,
  };
}
