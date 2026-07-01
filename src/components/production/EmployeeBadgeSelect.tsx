"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Search, UserRound } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { looksLikeFabricLabelInput } from "@/lib/sales-orders/label-codes";
import { cn } from "@/lib/utils";

type EmployeeOption = {
  id: string;
  employee_id_number: string;
  full_name: string;
};

type EmployeeBadgeSelectProps = {
  onSelect: (badgeCode: string) => void;
  disabled?: boolean;
  loading?: boolean;
  /** When true, hint points to Fabric Receiving label lookup. */
  fabricReceivingContext?: boolean;
};

function searchEmployees(employees: EmployeeOption[], query: string): EmployeeOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return employees;
  return employees.filter(
    (employee) =>
      employee.full_name.toLowerCase().includes(q) ||
      employee.employee_id_number.toLowerCase().includes(q) ||
      employee.id.toLowerCase().includes(q)
  );
}

export function EmployeeBadgeSelect({
  onSelect,
  disabled = false,
  loading = false,
  fabricReceivingContext = false,
}: EmployeeBadgeSelectProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(true);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 150);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      setFetching(true);
      setFetchError(null);
      try {
        const res = await fetch("/api/hr/employees");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load employees");
        if (!cancelled) setEmployees(data.employees ?? []);
      } catch (err) {
        if (!cancelled) {
          setFetchError(err instanceof Error ? err.message : "Failed to load employees");
        }
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    void loadEmployees();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredEmployees = useMemo(
    () => searchEmployees(employees, debouncedQuery),
    [debouncedQuery, employees]
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const blocked = disabled || loading || fetching;
  const fabricLabelQuery = looksLikeFabricLabelInput(debouncedQuery);

  function handlePick(employee: EmployeeOption) {
    setQuery(`${employee.full_name} — ID ${employee.employee_id_number}`);
    setOpen(false);
    onSelect(employee.employee_id_number);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          disabled={blocked}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => !blocked && setOpen(true)}
          placeholder={
            fetching
              ? "Loading employees…"
              : fetchError
                ? "Could not load employee list"
                : "Type name or ID to select…"
          }
          className={cn(
            "w-full min-h-[44px] rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-base sm:text-sm",
            blocked && "cursor-not-allowed bg-slate-50 text-slate-400"
          )}
          autoComplete="off"
          aria-label="Select employee by name or ID"
        />
        <button
          type="button"
          disabled={blocked}
          onClick={() => setOpen((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          aria-label="Toggle employee list"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          )}
        </button>
      </div>

      {!fetchError && !fetching && (
        <p className="mt-1 text-xs text-slate-500">
          {fabricLabelQuery ? (
            <span className="font-medium text-teal-800">
              {fabricReceivingContext
                ? "That looks like a fabric label — paste it in the “Receive fabric” box at the top of the page."
                : "That looks like a fabric label, not an employee. Scan it at step 2 after your badge."}
            </span>
          ) : (
            <>
              {filteredEmployees.length} active employee{filteredEmployees.length !== 1 ? "s" : ""}
              {debouncedQuery.trim() ? " match your search" : ""}
            </>
          )}
        </p>
      )}

      {fetchError && <p className="mt-1 text-xs text-red-600">{fetchError}</p>}

      {open && !blocked && !fabricLabelQuery && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {filteredEmployees.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              {query.trim() ? "No employees match your search." : "No active employees found."}
            </p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {filteredEmployees.map((employee) => (
                <li key={employee.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(employee)}
                    className="flex w-full min-h-[44px] items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-violet-50"
                  >
                    <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900">{employee.full_name}</span>
                      <span className="font-mono text-xs text-slate-500">ID {employee.employee_id_number}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
