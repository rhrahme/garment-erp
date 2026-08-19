import { migrateClientName } from "../../clients/names";
import { isGroupOrderName } from "./mappings";

export function parseClickUpClientName(name: string): {
  title: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  is_group: boolean;
} {
  const trimmed = name.trim();
  if (!trimmed) {
    return { title: null, first_name: "Unknown", middle_name: null, last_name: "Client", is_group: false };
  }

  if (isGroupOrderName(trimmed)) {
    return { title: null, first_name: trimmed, middle_name: null, last_name: "Group", is_group: true };
  }

  const names = migrateClientName({ name: trimmed });
  return { ...names, last_name: names.last_name || "Client", is_group: false };
}
