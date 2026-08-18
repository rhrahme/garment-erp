/** Public ERP origin for emails and QR links. Never localhost. */
export function erpPublicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://erp.hagan.pro").replace(/\/$/, "");
}
