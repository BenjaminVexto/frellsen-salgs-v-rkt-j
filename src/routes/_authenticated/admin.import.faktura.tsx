import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, FileUp, Loader2, CheckCircle2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enqueueInvoiceImport, resolveDeliveryNos } from "@/lib/invoice-import.functions";
import { parseAndAggregate } from "@/lib/invoice-parse";

export const Route = createFileRoute("/_authenticated/admin/import/faktura")({
  component: FakturaImportSide,
});

type JobRow = {
  id: string;
  status: string;
  phase: string;
  total_monthly: number;
  total_top: number;
  saved_monthly: number;
  saved_top: number;
  locations_matched: number;
  unmatched_delivery_nos: string[] | null;
  last_error: string | null;
  attempts: number;
};

const PHASE_LABEL: Record<string, string> = {
  monthly: "Gemmer månedsdata…",
  top: "Gemmer top-varer…",
  done: "Færdig",
};

// Skal matche CHUNK_SIZE i process-invoice-import.ts
const CHUNK_SIZE = 20_000;

const BUCKET = "invoice-uploads";

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function FakturaImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const enqueueFn = useServerFn(enqueueInvoiceImport);
  const resolveFn = useServerFn(resolveDeliveryNos);

  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [stage, setStage] = useState<string>("");
  const [stageProgress, setStageProgress] = useState<{ done: number; total: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    async function tick() {
      const { data, error } = await supabase
        .from("invoice_import_jobs")
        .select(
          "id,status,phase,total_monthly,total_top,saved_monthly,saved_top,locations_matched,unmatched_delivery_nos,last_error,attempts",
        )
        .eq("id", jobId!)
        .maybeSingle();
      if (cancelled || error || !data) return;
      setJob(data as JobRow);
      if (data.status === "completed" || data.status === "failed") {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
    tick();
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [jobId]);

  async function handleSubmit() {
    if (!file) return;
    setWorking(true);
    setJob(null);
    setJobId(null);
    try {
      // 1) Parse + aggregér i browseren (firma 10-filter + delt dato-helper)
      setStage("Parser fakturajournal…");
      setStageProgress(null);
      const { monthly, topProducts, stats } = await parseAndAggregate(file);
      toast.message(
        `Parset: ${stats.linesRead.toLocaleString("da-DK")} linjer · ${monthly.length.toLocaleString("da-DK")} månedsrækker · ${topProducts.length.toLocaleString("da-DK")} top-vare-rækker`,
      );

      // 2) Slå alle delivery_nos op én gang server-side
      setStage("Slår leverandørnumre op…");
      const allDeliveryNos = Array.from(
        new Set([...monthly.map((r) => r.visma_delivery_no), ...topProducts.map((r) => r.visma_delivery_no)]),
      );
      const { map } = await resolveFn({ data: { deliveryNos: allDeliveryNos } });
      const matched = Object.keys(map).length;
      const unmatched = allDeliveryNos.filter((d) => !map[d]);

      // 3) Berig in-place med location_id / company_id
      setStage("Beriger rækker med lokation/firma…");
      const enrichedMonthly = monthly.map((r) => ({
        ...r,
        location_id: map[r.visma_delivery_no]?.location_id ?? null,
        company_id: map[r.visma_delivery_no]?.company_id ?? null,
      }));
      const enrichedTop = topProducts.map((r) => ({
        ...r,
        location_id: map[r.visma_delivery_no]?.location_id ?? null,
      }));

      // 4) Chunk + upload til private storage
      const newJobId = crypto.randomUUID();
      const monthlyChunks = chunked(enrichedMonthly, CHUNK_SIZE);
      const topChunks = chunked(enrichedTop, CHUNK_SIZE);
      const totalUploads = monthlyChunks.length + topChunks.length;
      let uploadIdx = 0;

      setStage("Uploader data-chunks til server…");
      setStageProgress({ done: 0, total: totalUploads });

      async function uploadChunk(kind: "monthly" | "top", idx: number, rows: unknown[]) {
        const path = `${newJobId}/${kind}-${idx}.json`;
        const body = new Blob([JSON.stringify(rows)], { type: "application/json" });
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, body, { upsert: true, contentType: "application/json" });
        if (error) throw new Error(`Upload af ${path} fejlede: ${error.message}`);
        uploadIdx++;
        setStageProgress({ done: uploadIdx, total: totalUploads });
      }

      for (let i = 0; i < monthlyChunks.length; i++) await uploadChunk("monthly", i, monthlyChunks[i]);
      for (let i = 0; i < topChunks.length; i++) await uploadChunk("top", i, topChunks[i]);

      // 5) Enqueue jobbet — workeren tager over herfra
      setStage("Tilmelder job til server-worker…");
      setStageProgress(null);
      await enqueueFn({
        data: {
          jobId: newJobId,
          totalMonthly: enrichedMonthly.length,
          totalTop: enrichedTop.length,
          locationsMatched: matched,
          unmatched,
        },
      });

      setJobId(newJobId);
      setStage("");
      toast.success("Klar — workeren upserter nu i baggrunden. Du kan lukke fanen.");
    } catch (e: any) {
      toast.error(e?.message ?? "Ukendt fejl");
      setStage("");
    } finally {
      setWorking(false);
    }
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const running = job && (job.status === "queued" || job.status === "running");
  const pctMonthly =
    job && job.total_monthly > 0
      ? Math.min(100, Math.round((job.saved_monthly / job.total_monthly) * 100))
      : 0;
  const pctTop =
    job && job.total_top > 0 ? Math.min(100, Math.round((job.saved_top / job.total_top) * 100)) : 0;
  const stagePct = stageProgress && stageProgress.total > 0
    ? Math.round((stageProgress.done / stageProgress.total) * 100)
    : null;

  return (
    <div className="px-4 md:px-8 py-8 max-w-4xl mx-auto pb-24 md:pb-8 space-y-6">
      <div>
        <Link to="/admin/import" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-2 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Tilbage
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
          <Receipt className="h-6 w-6" /> Faktura/salgsdata
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browseren parser fakturajournalen og uploader færdige data-chunks. Workeren upserter i baggrunden — du kan lukke fanen, så snart upload er færdig.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <Label htmlFor="file">Fakturajournal (xlsx eller csv)</Label>
          <Input
            id="file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={working || !!running}
          />
          {file && (
            <p className="text-xs text-muted-foreground mt-1">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={!file || working || !!running}>
            {working ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Arbejder…</>
            ) : (
              <><FileUp className="h-4 w-4 mr-2" /> Upload og start import</>
            )}
          </Button>
        </div>

        {working && stage && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{stage}</span>
            </div>
            {stagePct !== null && (
              <>
                <Progress value={stagePct} />
                <p className="text-xs text-muted-foreground">
                  {stageProgress!.done} / {stageProgress!.total} chunks
                </p>
              </>
            )}
          </div>
        )}

        {job && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {job.status === "completed"
                  ? "Import færdig"
                  : job.status === "failed"
                    ? "Import fejlede"
                    : (PHASE_LABEL[job.phase] ?? `Fase: ${job.phase}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                Job: <code>{job.id.slice(0, 8)}</code> · forsøg {job.attempts}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Månedsrækker</span>
                <span className="text-muted-foreground">
                  {job.saved_monthly.toLocaleString("da-DK")} / {job.total_monthly.toLocaleString("da-DK")}
                </span>
              </div>
              <Progress value={pctMonthly} />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span>Top-varer</span>
                <span className="text-muted-foreground">
                  {job.saved_top.toLocaleString("da-DK")} / {job.total_top.toLocaleString("da-DK")}
                </span>
              </div>
              <Progress value={pctTop} />
            </div>
            <p className="text-xs text-muted-foreground">
              {job.locations_matched.toLocaleString("da-DK")} lev.nr. matchet til lokationer
              {Array.isArray(job.unmatched_delivery_nos) && job.unmatched_delivery_nos.length > 0 && (
                <> · {job.unmatched_delivery_nos.length} uden match</>
              )}
            </p>

            {job.status === "completed" && (
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" /> Færdig — alle rækker upsertet
              </div>
            )}
            {job.status === "failed" && job.last_error && (
              <p className="text-xs text-destructive">Fejl: {job.last_error}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
