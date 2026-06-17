"use client";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Shirt } from "lucide-react";
import { Button } from "@/components/ui/Button";
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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500">
            <Shirt className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Garment ERP</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to your factory dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-8 shadow-xl">
          {DEMO_MODE && (
            <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Demo mode — click Sign In to explore without Supabase configured.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                  placeholder="••••••••"
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
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
