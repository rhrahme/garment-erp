import { isSupabaseConfigured } from "@/lib/supabase/env";

export const DEMO_MODE = !isSupabaseConfigured();

export const DEMO_USER_EMAIL_COOKIE = "erp_demo_email";
