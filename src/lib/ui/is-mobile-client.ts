/**
 * Client-side mobile / phone-tablet detection for post-login UX.
 * Prefer this over server User-Agent alone (iPad desktop-mode UAs vary).
 */
export function isMobileClient(): boolean {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent || "";
  const uaMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    (/Macintosh/i.test(ua) && typeof window.navigator.maxTouchPoints === "number"
      ? window.navigator.maxTouchPoints > 1
      : false);

  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  const narrow =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 900px)").matches;

  return uaMobile || (coarsePointer && narrow);
}
