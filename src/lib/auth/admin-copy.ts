export const ADMIN_COPY_UNLOCK_CLASS = "admin-copy-unlock";

/** True when the signed-in admin is allowed to select and copy page text. */
export function isAdminCopyUnlocked(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains(ADMIN_COPY_UNLOCK_CLASS);
}
