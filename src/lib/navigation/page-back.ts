/** Top-level ERP routes — no Back button on these list/home pages. */
export const ERP_ROOT_PATHS = new Set([
  "/dashboard",
  "/fabric-receiving",
  "/brands",
  "/clients",
  "/ready-made",
  "/fabric-specification",
  "/inventory",
  "/production",
  "/orders",
  "/invoices",
  "/supplier-emails",
  "/supplier-inbox",
  "/supplier-invoices",
  "/purchasing",
  "/shipments",
  "/washing",
  "/quality",
  "/hr",
  "/costing",
  "/documents",
  "/login",
]);

export function shouldShowPageBack(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (ERP_ROOT_PATHS.has(path)) return false;
  return path.split("/").filter(Boolean).length >= 2;
}
