import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase/env";

function getServiceRoleKey(): string | null {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ??
    process.env.SUPABASE_SECRET_KEY?.trim() ??
    null
  );
}

export function hasSupabaseServiceRoleKey(): boolean {
  return Boolean(getServiceRoleKey());
}

export async function confirmSupabaseUserByEmail(email: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const serviceKey = getServiceRoleKey();
  const url = getSupabaseUrl();

  if (!serviceKey) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local.",
    };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) {
    return { ok: false, error: listError.message };
  }

  const user = list.users.find((row) => row.email?.toLowerCase() === normalizedEmail);
  if (!user) {
    return { ok: false, error: `No Supabase user found for ${normalizedEmail}.` };
  }

  if (user.email_confirmed_at) {
    return { ok: true, userId: user.id };
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true, userId: user.id };
}
