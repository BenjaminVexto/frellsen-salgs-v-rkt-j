import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { CvrBulkSoegningDialog } from "@/components/cvr-bulk-soegning-dialog";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import/cvr")({
  component: ImportCvrSide,
});

function ImportCvrSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

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
      </p>

      <CvrBulkSoegningDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) navigate({ to: "/admin/import" });
        }}
        onImported={() => {
          navigate({ to: "/virksomheder" });
        }}
      />

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="text-primary hover:underline text-sm"
        >
          Åbn søgning igen
        </button>
      )}
    </div>
  );
}
