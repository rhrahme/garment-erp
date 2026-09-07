import { Menu } from "lucide-react";
import { PageBackBar } from "@/components/layout/PageBackBar";
import { DEMO_MODE } from "@/lib/auth/demo-mode";
import type { SessionContext } from "@/lib/auth/session";
import { resolveUserDisplay } from "@/lib/auth/user-display";

export function Header({
  session,
  onMenuClick,
}: {
  session: SessionContext;
  onMenuClick?: () => void;
}) {
  const { name, title, initial } = resolveUserDisplay(session);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:h-16 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {onMenuClick ? (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        ) : null}
        <PageBackBar />
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        {DEMO_MODE && (
          <span className="hidden rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 sm:inline">
            Demo Mode — connect Supabase to go live
          </span>
        )}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
            {initial}
          </div>
          <div className="hidden text-sm sm:block">
            <p className="font-medium text-slate-900">{name}</p>
            <p className="text-xs text-slate-400">{title}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
