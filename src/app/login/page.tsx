"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, IdCard, Mail, Shirt } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AuthHealthBanner } from "@/components/layout/AuthHealthBanner";
import { DEMO_MODE, DEMO_USER_EMAIL_COOKIE } from "@/lib/auth/demo-mode";
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE } from "@/lib/auth/format-auth-error";

function normalizeLoginError(data: { error?: string }, status: number): string {
  if (status === 503 || status === 522) return AUTH_SERVICE_UNAVAILABLE_MESSAGE;

  const message = data.error?.trim();
  if (!message || message === "{}" || message === "[]") {
    return status >= 500 ? AUTH_SERVICE_UNAVAILABLE_MESSAGE : "Sign in failed.";
  }

  return message;
}

type LoginMode = "email" | "badge";
/** Badge flow: enter badge -> lookup -> type password (or create on first login). */
type BadgeStep = "enter_badge" | "login" | "set_password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>("badge");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [badge, setBadge] = useState("");
  const [badgeStep, setBadgeStep] = useState<BadgeStep>("enter_badge");
  const [badgeName, setBadgeName] = useState("");
  const [badgePassword, setBadgePassword] = useState("");
  const [badgeConfirm, setBadgeConfirm] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get("mode");
    const requestedBadge = params.get("badge")?.trim() ?? "";
    if (requestedMode === "email") setMode("email");
    if (requestedMode === "badge") setMode("badge");
    if (requestedBadge) {
      setBadge(requestedBadge);
      setMode("badge");
    }
  }, []);

  function switchMode(next: LoginMode) {
    setMode(next);
    setError("");
    setBadgeStep("enter_badge");
    setBadgePassword("");
    setBadgeConfirm("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (DEMO_MODE) {
      const demoEmail = email.trim().toLowerCase();
      if (demoEmail) {
        document.cookie = `${DEMO_USER_EMAIL_COOKIE}=${encodeURIComponent(demoEmail)}; path=/; max-age=2592000; samesite=lax`;
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        redirect?: string;
        error?: string;
      };

      if (!res.ok) {
        setError(normalizeLoginError(data, res.status));
        setLoading(false);
        return;
      }

      router.push((data.redirect ?? "/dashboard") as Route);
      router.refresh();
    } catch {
      setError("Sign in failed.");
      setLoading(false);
    }
  }

  async function badgeRequest(body: Record<string, string>) {
    const res = await fetch("/api/auth/badge-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      redirect?: string;
      error?: string;
      employee_name?: string;
      has_password?: boolean;
    };
    return { res, data };
  }

  async function handleBadgeLookup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { res, data } = await badgeRequest({ action: "lookup", badge: badge.trim() });
      if (!res.ok) {
        setError(normalizeLoginError(data, res.status));
        setLoading(false);
        return;
      }
      setBadgeName(data.employee_name ?? "");
      setBadgeStep(data.has_password ? "login" : "set_password");
      setLoading(false);
    } catch {
      setError("Badge check failed. Try again.");
      setLoading(false);
    }
  }

  async function handleBadgeSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body: Record<string, string> =
        badgeStep === "set_password"
          ? {
              action: "set_password",
              badge: badge.trim(),
              password: badgePassword,
              confirm_password: badgeConfirm,
            }
          : { action: "login", badge: badge.trim(), password: badgePassword };
      const { res, data } = await badgeRequest(body);
      if (!res.ok) {
        setError(normalizeLoginError(data, res.status));
        setLoading(false);
        return;
      }
      router.push((data.redirect ?? "/pattern") as Route);
      router.refresh();
    } catch {
      setError("Badge sign in failed.");
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <>
      <AuthHealthBanner />
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500">
            <Shirt className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Garment ERP</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to your factory dashboard</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <div className="mb-6 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("email")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === "email" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Mail className="h-4 w-4" /> Email
            </button>
            <button
              type="button"
              onClick={() => switchMode("badge")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                mode === "badge" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <IdCard className="h-4 w-4" /> Badge
            </button>
          </div>

          {mode === "email" ? (
            <form onSubmit={handleSubmit}>
              <p className="mb-4 text-xs text-slate-500">
                Pattern staff: use the Badge tab, or this Email tab with your
                old address and badge password.
              </p>
              {DEMO_MODE && (
                <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  Demo mode - click Sign In to explore without Supabase configured.
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                    placeholder="admin@factory.com"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="********"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

              <Button type="submit" className="mt-6 w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          ) : badgeStep === "enter_badge" ? (
            <form onSubmit={handleBadgeLookup}>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Badge / ID number
                </label>
                <input
                  type="text"
                  inputMode="text"
                  autoFocus
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  className={inputClass}
                  placeholder="2625917972"
                />
                <p className="mt-2 text-xs text-slate-500">
                  Scan the QR on your employee badge, or type the ID number printed on it.
                </p>
              </div>

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

              <Button type="submit" className="mt-6 w-full" disabled={loading || !badge.trim()}>
                {loading ? "Checking..." : "Continue"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleBadgeSubmit}>
              <div className="mb-4 rounded-lg bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-800">{badgeName || "Employee"}</p>
                <p className="text-xs text-slate-500">Badge {badge.trim()}</p>
              </div>

              {badgeStep === "set_password" && (
                <div className="mb-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                  First login: create your personal password (at least 6 characters). You will
                  use it with your badge from now on.
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    {badgeStep === "set_password" ? "New password" : "Password"}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoFocus
                      value={badgePassword}
                      onChange={(e) => setBadgePassword(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="********"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {badgeStep === "set_password" && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      Confirm password
                    </label>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={badgeConfirm}
                      onChange={(e) => setBadgeConfirm(e.target.value)}
                      className={inputClass}
                      placeholder="********"
                    />
                  </div>
                )}
              </div>

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

              <Button type="submit" className="mt-6 w-full" disabled={loading || !badgePassword}>
                {loading
                  ? "Signing in..."
                  : badgeStep === "set_password"
                    ? "Create password and sign in"
                    : "Sign In"}
              </Button>

              <button
                type="button"
                onClick={() => switchMode("badge")}
                className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-700"
              >
                Not you? Scan a different badge
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
