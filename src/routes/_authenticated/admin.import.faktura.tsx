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
import { parseAndAggregate, type ParseStats } from "@/lib/invoice-parse";
import {
  startInvoiceImportJob,
  getInvoiceImportJobStatus,
  type InvoiceImportJobStatus,
  type MonthlyRow,
  type TopProductRow,
} from "@/lib/invoice-import.functions";

export const Route = createFileRoute("/_authenticated/admin/import/faktura")({
  component: FakturaImportSide,
});

function fmtKr(n: number) {
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(n);
}

function FakturaImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const startFn = useServerFn(startInvoiceImportJob);
  const statusFn = useServerFn(getInvoiceImportJobStatus);

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [stats, setStats] = useState<ParseStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<InvoiceImportJobStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  // Poll job status while running
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    async function poll() {
      try {
        const s = await statusFn({ data: { jobId: jobId! } });
        if (cancelled) return;
        setJobStatus(s);
        if (s.status === "running" || s.status === "queued") {
          pollTimer.current = setTimeout(poll, 2000);
        } else if (s.status === "completed") {
          toast.success(`Import færdig: ${s.saved_monthly} månedsrækker, ${s.saved_top} top-varer`);
        } else if (s.status === "failed") {
          toast.error("Import fejlede: " + (s.error_message ?? "ukendt fejl"));
        }
      } catch (e: any) {
        if (cancelled) return;
        // transient network blip — retry
        pollTimer.current = setTimeout(poll, 3000);
      }
    }
    poll();
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [jobId, statusFn]);

  async function handleFile(f: File) {
    setFile(f);
    setJobId(null);
    setJobStatus(null);
    setStats(null);
    setParsing(true);
    try {
      const { monthly, topProducts, stats } = await parseAndAggregate(f);
      setMonthly(monthly);
      setTopProducts(topProducts);
      setStats(stats);
      toast.success(`${stats.linesRead.toLocaleString("da-DK")} linjer læst og aggregeret`);
    } catch (e: any) {
      toast.error("Kunne ikke læse fil: " + (e?.message ?? "ukendt fejl"));
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!monthly.length) return;
    setSubmitting(true);
    try {
      const res = await startFn({ data: { monthly, topProducts } });
      setJobId(res.jobId);
      toast.info("Import startet i baggrunden…");
    } catch (e: any) {
      toast.error("Kunne ikke starte job: " + (e?.message ?? "ukendt fejl"));
    } finally {
      setSubmitting(false);
    }
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isRunning = jobStatus?.status === "running" || jobStatus?.status === "queued";
  const totalRows = (jobStatus?.total_monthly ?? 0) + (jobStatus?.total_top ?? 0);
  const savedRows = (jobStatus?.saved_monthly ?? 0) + (jobStatus?.saved_top ?? 0);
  const pct = totalRows > 0 ? Math.min(100, Math.round((savedRows / totalRows) * 100)) : 0;

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
          Upload rå fakturajournal fra Visma (xlsx eller csv). Filen aggregeres pr. lev.nr. × måned × produktgruppe og gemmes idempotent i baggrunden.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div>
          <Label htmlFor="file">Fakturajournal (xlsx eller csv)</Label>
          <Input
            id="file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
            disabled={parsing || submitting || isRunning}
          />
          {file && <p className="text-xs text-muted-foreground mt-1">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
        </div>

        {parsing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Læser og aggregerer fil…
          </div>
        )}

        {stats && !parsing && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="font-medium">Preview</div>
            <ul className="space-y-1 text-muted-foreground">
              <li>📄 <b className="text-foreground">{stats.linesRead.toLocaleString("da-DK")}</b> faktura-linjer læst{stats.invalidLines > 0 && <> · {stats.invalidLines.toLocaleString("da-DK")} ugyldige sprunget over (Vismas subtotal-/sammendragsrækker)</>}</li>
              <li>🏷️ <b className="text-foreground">{stats.uniqueDeliveryNos.toLocaleString("da-DK")}</b> unikke lev.nr. i fil</li>
              <li>📅 Periode: <b className="text-foreground">{stats.periodFrom ?? "?"}</b> → <b className="text-foreground">{stats.periodTo ?? "?"}</b></li>
              <li>💰 Samlet omsætning: <b className="text-foreground">{fmtKr(stats.totalRevenue)}</b></li>
              <li>🔧 Interne service-posteringer (Beløb=0, DB≠0): <b className="text-foreground">{stats.internalServicePostings.toLocaleString("da-DK")}</b> linjer</li>
              <li>📊 Genererer: <b className="text-foreground">{monthly.length.toLocaleString("da-DK")}</b> månedsrækker · <b className="text-foreground">{topProducts.length.toLocaleString("da-DK")}</b> top-vare-rækker</li>
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!monthly.length || submitting || parsing || isRunning}>
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starter…</>
            ) : isRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gemmer… {pct}%</>
            ) : (
              <><FileUp className="h-4 w-4 mr-2" /> Gem aggregeret data</>
            )}
          </Button>
        </div>

        {jobStatus && isRunning && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Baggrundsjob kører…</span>
              <span className="text-muted-foreground">{savedRows.toLocaleString("da-DK")} / {totalRows.toLocaleString("da-DK")} rækker</span>
            </div>
            <Progress value={pct} />
            <p className="text-xs text-muted-foreground">
              Måneds-aggregater: {jobStatus.saved_monthly.toLocaleString("da-DK")} / {jobStatus.total_monthly.toLocaleString("da-DK")} ·
              Top-varer: {jobStatus.saved_top.toLocaleString("da-DK")} / {jobStatus.total_top.toLocaleString("da-DK")}
            </p>
            <p className="text-xs text-muted-foreground">Du kan trygt forlade siden — jobbet kører videre på serveren.</p>
          </div>
        )}

        {jobStatus?.status === "completed" && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium text-green-900 dark:text-green-100">
              <CheckCircle2 className="h-4 w-4" /> Import færdig
            </div>
            <ul className="space-y-1 text-green-900/80 dark:text-green-100/80">
              <li>✓ {jobStatus.saved_monthly.toLocaleString("da-DK")} månedsrækker gemt/opdateret</li>
              <li>✓ {jobStatus.saved_top.toLocaleString("da-DK")} top-vare-rækker gemt</li>
              <li>✓ {jobStatus.locations_matched.toLocaleString("da-DK")} lev.nr. matchet til lokationer</li>
              {jobStatus.unmatched_delivery_nos.length > 0 && (
                <li>⚠️ {jobStatus.unmatched_delivery_nos.length}+ lev.nr. uden match (sprunget over): <span className="font-mono text-xs">{jobStatus.unmatched_delivery_nos.slice(0, 10).join(", ")}{jobStatus.unmatched_delivery_nos.length > 10 && "…"}</span></li>
              )}
            </ul>
          </div>
        )}

        {jobStatus?.status === "failed" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <div className="font-medium text-destructive">Import fejlede</div>
            <p className="text-xs text-muted-foreground mt-1">{jobStatus.error_message}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
