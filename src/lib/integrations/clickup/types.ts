/** Minimal ClickUp task shape from API / MCP detailed responses */
export interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  type_config?: {
    options?: Array<{ id: string; name: string; label?: string; orderindex?: number }>;
  };
  value?: unknown;
}

export interface ClickUpTask {
  id: string;
  name: string;
  parent?: string | null;
  top_level_parent?: string | null;
  date_created?: string;
  date_updated?: string;
  due_date?: string | null;
  list?: { id: string; name?: string };
  custom_fields?: ClickUpCustomField[];
  subtasks?: ClickUpTask[];
}

export interface ClickUpImportResult {
  clients: number;
  sales_orders: number;
  production_work_orders: number;
  skipped_tasks: number;
  warnings: string[];
}
