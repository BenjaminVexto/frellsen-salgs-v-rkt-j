import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft, Plus, Tag } from "lucide-react";
import { PrismatrixTable } from "@/components/prismatrix-table";
import { EditDialog } from "./aftaler.index";

export const Route = createFileRoute("/_authenticated/aftaler/kp1/$code")({
  component: KP1DetailPage,
});

function KP1DetailPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const canEdit = auth.role === "admin";
  const initialValues = useMemo(
    () => ({
      name: `Kundeprisgruppe 1 — ${code}`,
      kp1_code: code,
      is_public_sector: false,
    }),
    [code],
  );
  return (
    <div className="px-4 md:px-8 py-6 md:py-8 max-w-6xl mx-auto">
      <Link
        to="/aftaler"
        className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Alle aftaler
      </Link>

      <Card className="p-5 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">Kundeprisgruppe 1 — {code}</h1>
            <p className="text-sm text-muted-foreground">
              Rene KP1-regler (uden kundenr og uden KP2). Opret en aftale med
              KP1-kode <span className="font-mono">{code}</span> for at koble
              dokument og virksomheder på.
            </p>
          </div>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setEditOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Opret aftale
            </Button>
          )}
        </div>
      </Card>

      <PrismatrixTable kp1={code} />
      <EditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        agreement={null}
        initialValues={initialValues}
        onSaved={(result) => {
          if (result?.id) {
            navigate({ to: "/aftaler/$id", params: { id: result.id } });
          }
        }}
      />
    </div>
  );
}
