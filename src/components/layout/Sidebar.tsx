"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ScanLine,
  Package,
  Factory,
  Map,
  ShoppingCart,
  Mail,
  Inbox,
  Truck,
  ClipboardCheck,
  Users,
  Calculator,
  Droplets,
  Plane,
  FileText,
  Receipt,
  LogOut,
  Shirt,
  SwatchBook,
  Tags,
  UsersRound,
  Store,
  FolderArchive,
  Ruler,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { CLIENT_MANAGER_NAV_HREFS, CLIENT_MANAGER_ORDERS_NAV_LABEL } from "@/lib/auth/permissions";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/fabric-receiving", label: "Fabric Receiving", icon: ScanLine },
  { href: "/brands", label: "Production Brands", icon: Tags },
  { href: "/clients", label: "Clients", icon: UsersRound },
  { href: "/ready-made", label: "Ready-Made", icon: Store },
  { href: "/fabric-specification", label: "Fabric Specification", icon: SwatchBook },
  { href: "/pattern", label: "Pattern", icon: Ruler },
  { href: "/inventory", label: "Inventory", icon: Package },
  { href: "/production", label: "Production", icon: Factory },
  { href: "/production/floor-map", label: "Factory floor map", icon: Map },
  { href: "/fabric-orders", label: "Fabric Orders", icon: Truck },
  { href: "/orders", label: "Sales Orders", icon: ShoppingCart },
  { href: "/invoices", label: "Invoicing", icon: Receipt },
  { href: "/supplier-emails", label: "Supplier Emails", icon: Mail },
  { href: "/supplier-inbox", label: "Supplier Inbox", icon: Inbox },
  { href: "/supplier-invoices", label: "Supplier Invoices", icon: FileText },
  { href: "/purchasing", label: "Purchasing", icon: Truck },
  { href: "/shipments", label: "AWB Tracking", icon: Plane },
  { href: "/washing", label: "Washing", icon: Droplets },
  { href: "/quality", label: "Quality Control", icon: ClipboardCheck },
  { href: "/hr", label: "HR & Payroll", icon: Users },
  { href: "/costing", label: "Costing", icon: Calculator },
  { href: "/documents", label: "Documents & Data", icon: FolderArchive },
];

const qcNavHrefs = new Set<string>(CLIENT_MANAGER_NAV_HREFS);
const qcNavItems = navItems.filter((item) => qcNavHrefs.has(item.href));

function isNavActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  if (href === "/production" && pathname.startsWith("/production/floor-map")) return false;
  return true;
}

export function Sidebar({ clientsOnly = false }: { clientsOnly?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const items = clientsOnly ? qcNavItems : navItems;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-slate-900 text-white">
      <div className="flex items-center gap-3 border-b border-slate-700 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
          <Shirt className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">Garment ERP</p>
          <p className="text-xs text-slate-400">Factory Management</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isNavActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-indigo-600 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {clientsOnly && href === "/orders"
                    ? CLIENT_MANAGER_ORDERS_NAV_LABEL
                    : clientsOnly && href === "/fabric-orders"
                      ? "Fabric Orders"
                      : label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-700 p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
