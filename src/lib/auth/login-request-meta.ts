/** IP + device from the incoming login request (Vercel / proxies). */

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return first;
  const real =
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    headers.get("x-vercel-forwarded-for")?.trim();
  return real || "unknown";
}

export function describeLoginDevice(userAgent: string): string {
  const src = userAgent.trim();
  if (!src) return "Unknown device";
  const browser = /Edg\//i.test(src)
    ? "Edge"
    : /OPR\/|Opera/i.test(src)
      ? "Opera"
      : /Chrome\//i.test(src)
        ? "Chrome"
        : /Firefox\//i.test(src)
          ? "Firefox"
          : /Safari\//i.test(src)
            ? "Safari"
            : "Browser";
  const os = /Windows/i.test(src)
    ? "Windows"
    : /Android/i.test(src)
      ? "Android"
      : /iPhone|iPad|iPod/i.test(src)
        ? "iOS"
        : /Mac OS X|Macintosh/i.test(src)
          ? "Mac"
          : /Linux/i.test(src)
            ? "Linux"
            : "Unknown OS";
  return `${browser} on ${os}`;
}

export function loginRequestMeta(request: Request): {
  ip: string;
  user_agent: string;
  device: string;
} {
  const user_agent = request.headers.get("user-agent") ?? "";
  return {
    ip: clientIpFromHeaders(request.headers),
    user_agent: user_agent.slice(0, 400),
    device: describeLoginDevice(user_agent),
  };
}
