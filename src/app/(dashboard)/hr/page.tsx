import { PageHeader, DataTable } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { getEmployees } from "@/lib/data/queries";
import { formatCurrency } from "@/lib/utils";

export default async function HRPage() {
  const employees = await getEmployees();

  const byDept = employees.reduce<Record<string, number>>((acc, e) => {
    acc[e.department] = (acc[e.department] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="HR & Payroll"
        description="Employees, attendance, and piece-rate tracking"
        action={<Button>+ Add Employee</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Object.entries(byDept).map(([dept, count]) => (
          <div key={dept} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm text-slate-500">{dept}</p>
            <p className="mt-1 text-2xl font-bold">{count}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={[
          { key: "code", label: "Employee #" },
          { key: "name", label: "Name" },
          { key: "dept", label: "Department" },
          { key: "title", label: "Job Title" },
          { key: "rate", label: "Hourly Rate" },
          { key: "status", label: "Status" },
        ]}
        rows={employees.map((e) => ({
          code: <span className="font-medium">{e.employee_code}</span>,
          name: e.full_name,
          dept: e.department,
          title: e.job_title ?? "—",
          rate: e.hourly_rate ? formatCurrency(e.hourly_rate) + "/hr" : "—",
          status: e.is_active ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Active</span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Inactive</span>
          ),
        }))}
      />
    </div>
  );
}
