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
import { parseInvoiceJournal } from "@/lib/invoice-parse";
import { ImportKolonneTjekliste } from "@/components/import-kolonne-tjekliste";
import { IMPORT_KONTRAKTER } from "@/lib/import-kontrakter";

export const Route = createFileRoute("/_authenticated/admin/import/faktura")({
  component: FakturaImportSide,
});

type JobRow = {
  id: string;
  status: string;
  phase: string;
  total_lines: number | null;
  saved_lines: number | null;
  lines_deleted: number | null;
  months_rebuilt: number | null;
  lines_date_from: string | null;
  lines_date_to: string | null;
  locations_matched: number;
  unmatched_delivery_nos: string[] | null;
  last_error: string | null;
  attempts: number;
};

const PHASE_LABEL: Record<string, string> = {
  lines: "Skriver fakturalinjer…",
  prune: "Rydder gamle fakturalinjer…",
  aggregate: "Genberegner salgsdata…",
  relink: "Kobler salgsrækker til kunder…",
  done: "Færdig",
};

// Rå fakturalinjer: 5.000 pr. chunk (SKAL matche workeren).
const LINES_CHUNK_SIZE = 5_000;

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
  const [rowsByAfdeling, setRowsByAfdeling] = useState<Record<string, number> | null>(null);
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
          "id,status,phase,total_lines,saved_lines,lines_deleted,months_rebuilt,lines_date_from,lines_date_to,locations_matched,unmatched_delivery_nos,last_error,attempts",
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
      // 0) Hent gyldige afdelinger + alias-map — bruges til firma-filter,
      //    kildeafdeling→kanonisk afdeling og validering
      setStage("Henter afdelinger…");
      const [{ data: afdRows, error: afdErr }, { data: aliasRows, error: aliasErr }] = await Promise.all([
        supabase.from("afdeling").select("afdeling_nr, firma_nr").eq("aktiv", true),
        supabase.from("afdeling_alias").select("kilde_afdeling_nr, afdeling_nr"),
      ]);
      if (afdErr) throw new Error("Kunne ikke hente afdelinger: " + afdErr.message);
      if (aliasErr) throw new Error("Kunne ikke hente afdelings-alias: " + aliasErr.message);
      const afdelinger = (afdRows ?? []) as Array<{ afdeling_nr: number; firma_nr: number | null }>;
      const afdelingAliases = (aliasRows ?? []) as Array<{ kilde_afdeling_nr: number; afdeling_nr: number }>;
      if (!afdelinger.length) throw new Error("Ingen aktive afdelinger fundet");
      if (!afdelingAliases.length) throw new Error("Ingen rækker i afdeling_alias — kan ikke mappe kildeafdelinger");

      // 1) Parse filen til RÅ linjer (firma-filter + afdelings-alias)
      setStage("Parser fakturajournal…");
      setStageProgress(null);
      const { rawLines, stats } = await parseInvoiceJournal(file, { afdelinger, afdelingAliases });

      setRowsByAfdeling(stats.rowsByAfdeling);
      toast.message(
        `Parset: ${stats.linesRead.toLocaleString("da-DK")} fakturalinjer · ${stats.uniqueDeliveryNos.toLocaleString("da-DK")} leveringsnumre`,
      );

      // 2) Slå leveringsnumre op — kun til visning af hvor mange der er kendt.
      //    Selve koblingen til lokation sker i databasens genberegning.
      setStage("Slår leveringsnumre op…");
      const pairMap = new Map<string, { afdeling_nr: number; visma_delivery_no: string }>();
      for (const r of rawLines) {
        pairMap.set(`${r.afdeling_nr}|${r.visma_delivery_no}`, {
          afdeling_nr: r.afdeling_nr,
          visma_delivery_no: r.visma_delivery_no,
        });
      }
      const pairs = Array.from(pairMap.values());
      const { map } = await resolveFn({ data: { pairs } });
      const matched = Object.keys(map).length;
      const unmatched = Array.from(pairMap.keys()).filter((k) => !map[k]);

      // 3) Chunk + upload rålinjer til private storage
      const newJobId = crypto.randomUUID();
      const linesBatchId = crypto.randomUUID();
      const lineChunks = chunked(rawLines, LINES_CHUNK_SIZE);
      const totalUploads = lineChunks.length;
      let uploadIdx = 0;

      setStage("Uploader fakturalinjer til server…");
      setStageProgress({ done: 0, total: totalUploads });

      async function uploadChunk(idx: number, rows: unknown[]) {
        const path = `${newJobId}/lines-${idx}.json`;
        const body = new Blob([JSON.stringify(rows)], { type: "application/json" });
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, body, { upsert: true, contentType: "application/json" });
        if (error) throw new Error(`Upload af ${path} fejlede: ${error.message}`);
        uploadIdx++;
        setStageProgress({ done: uploadIdx, total: totalUploads });
      }

      for (let i = 0; i < lineChunks.length; i++) await uploadChunk(i, lineChunks[i]);

      // 4) Enqueue jobbet — workeren skriver linjer, rydder, genberegner og kobler
      setStage("Tilmelder job til server-worker…");
      setStageProgress(null);
      await enqueueFn({
        data: {
          jobId: newJobId,
          locationsMatched: matched,
          unmatched,
          rowsByAfdeling: stats.rowsByAfdeling,
          totalLines: rawLines.length,
          linesBatchId,
          dateFrom: stats.dateFrom,
          dateTo: stats.dateTo,
          afdelinger: Object.keys(stats.rowsByAfdeling).map((k) => Number(k)),
        },
      });

      setJobId(newJobId);
      setStage("");
      toast.success(
        "Klar — serveren skriver linjerne og genberegner salgsdata i baggrunden. Du kan lukke fanen.",
      );

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
          <Receipt className="h-6 w-6" /> Faktura Journal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browseren uploader fakturajournalens linjer. Serveren skriver dem, rydder de gamle og
          genberegner salgsdata for de berørte måneder — du kan lukke fanen, så snart upload er
          færdig. Filen behøver ikke følge månedsskift.
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

            {(job.total_lines ?? 0) > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>Fakturalinjer (rådata)</span>
                  <span className="text-muted-foreground">
                    {(job.saved_lines ?? 0).toLocaleString("da-DK")} /{" "}
                    {(job.total_lines ?? 0).toLocaleString("da-DK")}
                  </span>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    Math.round(((job.saved_lines ?? 0) / (job.total_lines || 1)) * 100),
                  )}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {job.locations_matched.toLocaleString("da-DK")} lev.nr. matchet til lokationer
              {Array.isArray(job.unmatched_delivery_nos) && job.unmatched_delivery_nos.length > 0 && (
                <> · {job.unmatched_delivery_nos.length} uden match</>
              )}
              {(job.months_rebuilt ?? 0) > 0 && (
                <> · {(job.months_rebuilt ?? 0).toLocaleString("da-DK")} måneder genberegnet</>
              )}
            </p>

            {rowsByAfdeling && Object.keys(rowsByAfdeling).length > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Linjer pr. afdeling:</span>{" "}
                {Object.entries(rowsByAfdeling)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([afd, n]) => `afd ${afd}: ${n.toLocaleString("da-DK")}`)
                  .join(" · ")}
              </div>
            )}

            {job.status === "completed" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <CheckCircle2 className="h-4 w-4" /> Færdig — salgsdata genberegnet
                </div>
                <p className="text-xs text-muted-foreground">
                  {(job.saved_lines ?? 0).toLocaleString("da-DK")} linjer skrevet ·{" "}
                  {(job.lines_deleted ?? 0).toLocaleString("da-DK")} linjer slettet ·{" "}
                  {(job.months_rebuilt ?? 0).toLocaleString("da-DK")} måneder genberegnet
                  {job.lines_date_from && job.lines_date_to && (
                    <> · periode {job.lines_date_from} – {job.lines_date_to}</>
                  )}
                </p>
              </div>
            )}

            {job.last_error && (
              <p className="text-xs text-destructive">Fejl: {job.last_error}</p>
            )}
          </div>
        )}
      </Card>

      <ImportKolonneTjekliste kontrakt={IMPORT_KONTRAKTER.faktura} />
    </div>
  );
}
