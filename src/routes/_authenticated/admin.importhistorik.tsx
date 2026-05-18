import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import {
  listImportBatches,
  getImportBatchBreakdown,
  deleteBatchGroup,
} from "@/lib/admin-companies.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/importhistorik")({
  component: ImporthistorikSide,
});

type Batch = {
  id: string;
  filename: string | null;
  created_at: string;
  created_by_name: string;
  company_count: number;
};

type CompanyRow = { id: string; name: string; cvr: string; city: string | null };

type Breakdown = {
  batch: {
    id: string;
    filename: string | null;
    created_at: string;
    created_by: string;
    company_count: number;
  };
  untouched: CompanyRow[];
  partial: CompanyRow[];
  active: CompanyRow[];
};

function ImporthistorikSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const fetchBatches = useServerFn(listImportBatches);
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  useEffect(() => {
    if (auth.role !== "admin") return;
    fetchBatches()
      .then((b: Batch[]) => setBatches(b))
      .catch((e: any) => toast.error("Kunne ikke hente importer: " + e.message));
  }, [auth.role, fetchBatches]);

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (selectedId) {
    return (
      <BatchDetalje
        batchId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="px-4 md:px-8 py-8 max-w-5xl mx-auto pb-24 md:pb-8">
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">Importhistorik</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Oversigt over tidligere CSV-imports. Klik på en import for at se og oprydde.
      </p>

      <Card className="overflow-x-auto">
        {batches === null ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Indlæser…
          </div>
        ) : batches.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Ingen imports endnu.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dato</TableHead>
                <TableHead>Filnavn</TableHead>
                <TableHead className="text-right">Virksomheder</TableHead>
                <TableHead>Importeret af</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow
                  key={b.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedId(b.id)}
                >
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(b.created_at), "d. MMM yyyy HH:mm", { locale: da })}
                  </TableCell>
                  <TableCell className="text-sm">{b.filename ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium">{b.company_count}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{b.created_by_name}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">Se →</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function BatchDetalje({ batchId, onBack }: { batchId: string; onBack: () => void }) {
  const fetchBreakdown = useServerFn(getImportBatchBreakdown);
  const deleteGroup = useServerFn(deleteBatchGroup);
  const [data, setData] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<null | "untouched" | "partial">(null);
  const [deleting, setDeleting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = (await fetchBreakdown({ data: { batch_id: batchId } })) as Breakdown;
      setData(res);
    } catch (e: any) {
      toast.error("Kunne ikke hente: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  async function runDelete(group: "untouched" | "partial") {
    setDeleting(true);
    try {
      const res = (await deleteGroup({ data: { batch_id: batchId, group } })) as { deleted: number };
      toast.success(`${res.deleted} virksomheder slettet`);
      setConfirm(null);
      await reload();
    } catch (e: any) {
      toast.error("Sletning fejlede: " + e.message);
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-8 max-w-5xl mx-auto pb-24 md:pb-8">
      <button
        onClick={onBack}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Tilbage til importhistorik
      </button>
      <h1 className="text-2xl md:text-3xl font-semibold mb-1">
        {data.batch.filename ?? "Import"}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {format(new Date(data.batch.created_at), "d. MMMM yyyy 'kl.' HH:mm", { locale: da })}
        {" · "}
        {data.batch.company_count} virksomheder importeret af {data.batch.created_by_name}
      </p>

      <div className="space-y-4">
        <GruppeKort
          tone="success"
          emoji="🟢"
          title="Uberørte"
          count={data.untouched.length}
          description="Ingen aktiviteter eller salgsmuligheder. Kan slettes sikkert."
          companies={data.untouched}
          actionLabel="Slet alle uberørte"
          onAction={data.untouched.length > 0 ? () => setConfirm("untouched") : undefined}
        />
        <GruppeKort
          tone="warning"
          emoji="🟡"
          title="Delvist berørte"
          count={data.partial.length}
          description="Tildelt sælger, men ingen aktiviteter endnu."
          companies={data.partial}
          actionLabel="Slet alligevel"
          onAction={data.partial.length > 0 ? () => setConfirm("partial") : undefined}
          actionWarning
        />
        <GruppeKort
          tone="destructive"
          emoji="🔴"
          title="Aktive"
          count={data.active.length}
          description="Har aktiviteter, noter eller salgsmuligheder. Kan ikke slettes i bulk — klik ind og slet enkeltvist."
          companies={data.active}
          showLinks
        />
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "untouched"
                ? "Slet uberørte virksomheder?"
                : "Slet delvist berørte virksomheder?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "untouched" ? (
                <>
                  Du er ved at slette {data.untouched.length} virksomheder permanent. De har
                  ingen aktiviteter eller salgsmuligheder. Dette kan ikke fortrydes.
                </>
              ) : (
                <>
                  <strong>Advarsel:</strong> Du sletter {data.partial.length} virksomheder der
                  er tildelt en sælger. Tildelingerne forsvinder også. Dette kan ikke fortrydes.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirm) runDelete(confirm);
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Sletter…" : "Slet permanent"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GruppeKort({
  tone,
  emoji,
  title,
  count,
  description,
  companies,
  actionLabel,
  onAction,
  actionWarning,
  showLinks,
}: {
  tone: "success" | "warning" | "destructive";
  emoji: string;
  title: string;
  count: number;
  description: string;
  companies: CompanyRow[];
  actionLabel?: string;
  onAction?: () => void;
  actionWarning?: boolean;
  showLinks?: boolean;
}) {
  const toneClass = {
    success: "border-success/40 bg-success/5",
    warning: "border-warning/40 bg-warning/5",
    destructive: "border-destructive/40 bg-destructive/5",
  }[tone];

  return (
    <Card className={`p-5 border ${toneClass}`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <span>{emoji}</span>
            {title}
            <Badge variant="secondary">{count}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {actionLabel && onAction && (
          <Button
            variant={actionWarning ? "outline" : "destructive"}
            size="sm"
            onClick={onAction}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {actionLabel}
          </Button>
        )}
      </div>

      {companies.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ingen virksomheder i denne gruppe.</p>
      ) : (
        <div className="max-h-60 overflow-y-auto border rounded-md bg-card divide-y">
          {companies.slice(0, 100).map((c) => (
            <div
              key={c.id}
              className="px-3 py-2 text-sm flex items-center justify-between"
            >
              <div>
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  CVR {c.cvr}
                  {c.city ? ` · ${c.city}` : ""}
                </div>
              </div>
              {showLinks && (
                <Link
                  to="/virksomheder/$id"
                  params={{ id: c.id }}
                  className="text-xs text-primary hover:underline"
                >
                  Åbn →
                </Link>
              )}
            </div>
          ))}
          {companies.length > 100 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Viser de første 100 af {companies.length}.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
