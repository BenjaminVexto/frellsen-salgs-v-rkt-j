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
import { enqueueInvoiceImport } from "@/lib/invoice-import.functions";

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
  uploaded: "Venter på worker (parser fil)…",
  monthly: "Gemmer månedsdata…",
  top: "Gemmer top-varer…",
  done: "Færdig",
};

function FakturaImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const enqueueFn = useServerFn(enqueueInvoiceImport);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobRow | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  // Poll job status hvert 3. sekund mens jobbet kører
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    async function tick() {
      const { data, error } = await supabase
        .from("invoice_import_jobs")
        .select("id,status,phase,total_monthly,total_top,saved_monthly,saved_top,locations_matched,unmatched_delivery_nos,last_error,attempts")
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
    setUploading(true);
    try {
      const ext = file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
      const id = crypto.randomUUID();
      const filePath = `${id}/source.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("invoice-uploads")
        .upload(filePath, file, { upsert: false, contentType: file.type || undefined });
      if (upErr) throw new Error("Upload fejlede: " + upErr.message);

      const { jobId: newId } = await enqueueFn({ data: { filePath } });
      setJobId(newId);
      toast.success("Fil uploadet — worker starter inden for et minut");
    } catch (e: any) {
      toast.error(e?.message ?? "Ukendt fejl");
    } finally {
      setUploading(false);
    }
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const running = job && (job.status === "pending" || job.status === "running");
  const pctMonthly = job && job.total_monthly > 0
    ? Math.min(100, Math.round((job.saved_monthly / job.total_monthly) * 100))
    : 0;
  const pctTop = job && job.total_top > 0
    ? Math.min(100, Math.round((job.saved_top / job.total_top) * 100))
    : 0;

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
          Upload rå fakturajournal fra Visma (xlsx eller csv). Filen lægges i kø og behandles server-side af workeren (kører hvert minut). Du kan lukke browseren — importen fortsætter.
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
            disabled={uploading || !!running}
          />
          {file && <p className="text-xs text-muted-foreground mt-1">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={!file || uploading || !!running}>
            {uploading ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploader fil…</>
            ) : (
              <><FileUp className="h-4 w-4 mr-2" /> Upload og start import</>
            )}
          </Button>
        </div>

        {job && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {job.status === "completed" ? "Import færdig" :
                 job.status === "failed" ? "Import fejlede" :
                 PHASE_LABEL[job.phase] ?? `Fase: ${job.phase}`}
              </span>
              <span className="text-xs text-muted-foreground">Job: <code>{job.id.slice(0, 8)}</code> · forsøg {job.attempts}</span>
            </div>

            {job.phase !== "uploaded" && (
              <>
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
              </>
            )}

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
