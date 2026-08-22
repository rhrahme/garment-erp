import { PageHeader } from "@/components/ui/PageHeader";
import { PatternMissingFilesList } from "@/components/pattern/PatternMissingFilesList";

export default function PatternMissingFilesPage() {
  return (
    <div>
      <PageHeader
        title="Files"
        description="Clients by brand. See who uploaded TUD, DXF, and RUL, and who still needs files."
      />
      <PatternMissingFilesList />
    </div>
  );
}
