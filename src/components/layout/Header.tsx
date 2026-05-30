import { DEMO_MODE } from "@/lib/data/queries";

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
      <div />
      <div className="flex items-center gap-4">
        {DEMO_MODE && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
            Demo Mode — connect Supabase to go live
          </span>
        )}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-semibold text-indigo-700">
            A
          </div>
          <div className="text-sm">
            <p className="font-medium text-slate-900">Admin User</p>
            <p className="text-xs text-slate-400">Production Manager</p>
          </div>
        </div>
      </div>
    </header>
  );
}
