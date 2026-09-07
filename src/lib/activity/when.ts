const RIYADH = "Asia/Riyadh";

export function formatActivityDateTime(iso: string): { date: string; time: string; label: string } {
  const stamped = Date.parse(iso);
  if (!Number.isFinite(stamped)) {
    return { date: iso, time: "", label: iso };
  }
  const at = new Date(stamped);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return { date, time, label: `${date}, ${time}` };
}

export function articleLabelFromNumber(articleNumber: number | null | undefined): string | null {
  if (articleNumber == null || !Number.isFinite(articleNumber)) return null;
  return `L${String(Math.trunc(articleNumber)).padStart(2, "0")}`;
}
