import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAuthUser, resolveAuthUserDetailed } from "@/lib/auth/resolve-auth-user";
import { SUPABASE_AUTH_TIMEOUT_MS } from "@/lib/auth/supabase-timeout";
import type { SupabaseClient, User } from "@supabase/supabase-js";

function neverSettles<T>(): Promise<T> {
  return new Promise(() => {});
}

describe("resolveAuthUser", () => {
  it("falls back to session user when getUser times out", async () => {
    const user = { id: "u1", email: "a@b.com" } as User;
    const supabase = {
      auth: {
        getUser: () => neverSettles(),
        getSession: async () => ({ data: { session: { user } }, error: null }),
      },
    } as unknown as SupabaseClient;

    const started = Date.now();
    const resolved = await resolveAuthUser(supabase);
    const elapsed = Date.now() - started;

    assert.equal(resolved?.id, "u1");
    assert.ok(
      elapsed < SUPABASE_AUTH_TIMEOUT_MS + 1500,
      `expected timeout fallback under ~${SUPABASE_AUTH_TIMEOUT_MS + 1500}ms, got ${elapsed}ms`
    );
  });

  it("returns null quickly when both getUser and getSession hang", async () => {
    const supabase = {
      auth: {
        getUser: () => neverSettles(),
        getSession: () => neverSettles(),
      },
    } as unknown as SupabaseClient;

    const started = Date.now();
    const resolved = await resolveAuthUser(supabase);
    const elapsed = Date.now() - started;

    assert.equal(resolved, null);
    assert.ok(
      elapsed < SUPABASE_AUTH_TIMEOUT_MS * 2 + 2000,
      `expected dual timeout under ~${SUPABASE_AUTH_TIMEOUT_MS * 2 + 2000}ms, got ${elapsed}ms`
    );
  });

  it("reports degraded when both calls hang (hold, do not bounce to /login)", async () => {
    const supabase = {
      auth: {
        getUser: () => neverSettles(),
        getSession: () => neverSettles(),
      },
    } as unknown as SupabaseClient;

    const { user, degraded } = await resolveAuthUserDetailed(supabase);
    assert.equal(user, null);
    assert.equal(degraded, true);
  });

  it("reports degraded on retryable GoTrue errors (0/5xx/429)", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { status: 503 } }),
        getSession: async () => ({ data: { session: null }, error: { status: 0 } }),
      },
    } as unknown as SupabaseClient;

    const { user, degraded } = await resolveAuthUserDetailed(supabase);
    assert.equal(user, null);
    assert.equal(degraded, true);
  });

  it("is NOT degraded when GoTrue definitively rejects the session (401)", async () => {
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: { status: 401 } }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    } as unknown as SupabaseClient;

    const { user, degraded } = await resolveAuthUserDetailed(supabase);
    assert.equal(user, null);
    assert.equal(degraded, false);
  });

  it("is not degraded when a valid user resolves", async () => {
    const user = { id: "u2", email: "b@c.com" } as User;
    const supabase = {
      auth: {
        getUser: async () => ({ data: { user }, error: null }),
        getSession: async () => ({ data: { session: null }, error: null }),
      },
    } as unknown as SupabaseClient;

    const resolved = await resolveAuthUserDetailed(supabase);
    assert.equal(resolved.user?.id, "u2");
    assert.equal(resolved.degraded, false);
  });
});
