import path from "path";
import { readJsonFile, writeJsonFile } from "@/lib/data/json-file-cache";

const STORE_PATH = path.join(process.cwd(), "integration-events.local.json");

interface EventLog {
  events: Array<{
    event: string;
    timestamp: string;
    data: Record<string, unknown>;
  }>;
}

function readLog(): EventLog {
  return readJsonFile(STORE_PATH, { events: [] });
}

function writeLog(log: EventLog): void {
  writeJsonFile(STORE_PATH, log);
}

export function logIntegrationEvent(event: string, data: Record<string, unknown>): void {
  const log = readLog();
  log.events.unshift({
    event,
    timestamp: new Date().toISOString(),
    data,
  });
  log.events = log.events.slice(0, 200);
  writeLog(log);
}

export function listIntegrationEvents(limit = 50) {
  return readLog().events.slice(0, limit);
}
