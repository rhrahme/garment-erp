import { PageHeader } from "@/components/ui/PageHeader";
import { ClientProfilesEditor } from "@/components/clients/ClientProfilesEditor";

export default function ClientsPage() {
  return (
    <div>
      <PageHeader
        title="Client Profiles"
        description="Bespoke clients only — ready-made retail brands are under Ready-Made."
      />

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
        <p className="font-medium">Auto-save enabled</p>
        <p className="mt-1 text-blue-800">
          Add the client name, brand, and contact details — a unique client code (e.g. FR-0526-0008) is assigned
          automatically. The middle segment is join month/year; the last four digits continue per brand.
        </p>
      </div>

      <ClientProfilesEditor />
    </div>
  );
}
