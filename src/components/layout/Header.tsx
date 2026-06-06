import { PageBackBar } from "@/components/layout/PageBackBar";
import { DEMO_MODE } from "@/lib/data/queries";
import type { SessionContext } from "@/lib/auth/session";
import { resolveUserDisplay } from "@/lib/auth/user-display";

export function Header({ session }: { session: SessionContext }) {
  const { name, title, initial } = resolveUserDisplay(session);

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
      <PageBackBar />
      <div className="flex items-center gap-4">
        {DEMO_MODE && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
            Demo Mode — connect Supabase to go live
          </span>
        )}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700">
            {initial}
          </div>
          <div className="text-sm">
            <p className="font-medium text-slate-900">{name}</p>
            <p className="text-xs text-slate-400">{title}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
