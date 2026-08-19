"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, LibraryBig, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/pattern", label: "Queue", icon: ListTodo, match: "queue" as const },
  { href: "/pattern/how-to", label: "How-to", icon: BookOpen, match: "prefix" as const },
  { href: "/pattern/library", label: "Library", icon: LibraryBig, match: "prefix" as const },
];

function isTabActive(pathname: string, tab: (typeof TABS)[number]): boolean {
  if (tab.match === "prefix") return pathname.startsWith(tab.href);
  if (pathname === "/pattern") return true;
  return pathname.startsWith("/pattern/orders") || pathname.startsWith("/pattern/jobs");
}

export function PatternWorkspaceTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {TABS.map((tab) => {
        const active = isTabActive(pathname, tab);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
              active
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
