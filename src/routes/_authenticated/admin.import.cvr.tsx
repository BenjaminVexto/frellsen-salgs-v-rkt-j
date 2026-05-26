import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { CvrBulkSoegningDialog } from "@/components/cvr-bulk-soegning-dialog";
import { AssignToListDialog } from "@/components/assign-to-list-dialog";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import/cvr")({
  component: ImportCvrSide,
});

type CompanyRegion = { id: string; municipality: string | null };

function ImportCvrSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [importedCompanies, setImportedCompanies] = useState<CompanyRegion[]>([]);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleImported = async (companyIds: string[]) => {
    setSearchOpen(false);
    if (!companyIds.length) {
      navigate({ to: "/virksomheder" });
      return;
    }
    // Hent kommuner for sælger-fordeling
    const all: CompanyRegion[] = [];
    for (let i = 0; i < companyIds.length; i += 500) {
      const slice = companyIds.slice(i, i + 500);
      const { data } = await supabase
        .from("companies")
        .select("id, municipality")
        .in("id", slice);
      (data ?? []).forEach((c: any) => all.push({ id: c.id, municipality: c.municipality }));
    }
    setImportedCompanies(all);
    setAssignOpen(true);
  };

  return (
    <div className="px-4 md:px-8 py-8 max-w-5xl mx-auto pb-24 md:pb-8">
      <Link
        to="/admin/import"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Vælg anden importtype
      </Link>
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">Søg nye emner i CVR-registret</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Find nye potentielle kunder direkte i CVR-registret. Filtrer på kommune, branche og virksomhedsform.
        Efter import kan du tildele de nye emner til en sælger og en kontaktliste.
      </p>

      <CvrBulkSoegningDialog
        open={searchOpen}
        onOpenChange={(v) => {
          setSearchOpen(v);
          if (!v && !assignOpen) navigate({ to: "/admin/import" });
        }}
        onImported={handleImported}
      />

      {!searchOpen && !assignOpen && (
        <button
          onClick={() => setSearchOpen(true)}
          className="text-primary hover:underline text-sm"
        >
          Åbn søgning igen
        </button>
      )}

      <AssignToListDialog
        open={assignOpen}
        onOpenChange={(v) => {
          setAssignOpen(v);
          if (!v) navigate({ to: "/virksomheder" });
        }}
        companies={importedCompanies}
        onAssigned={() => {
          setAssignOpen(false);
          navigate({ to: "/kontaktlister" });
        }}
      />
    </div>
  );
}
