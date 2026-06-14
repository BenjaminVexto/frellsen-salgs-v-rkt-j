import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  resolveDeliveryNos,
  uploadSalesMonthlyChunk,
  uploadSalesTopProductsChunk,
  finalizeInvoiceImportJob,
  type MonthlyRow,
  type TopProductRow,
  type ResolvedMonthlyRow,
  type ResolvedTopProductRow,
} from "@/lib/invoice-import.functions";

export const Route = createFileRoute("/_authenticated/admin/import/faktura")({
  component: FakturaImportSide,
});

const CHUNK = 2000;

function fmtKr(n: number) {
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK", maximumFractionDigits: 0 }).format(n);
}

type Phase = "idle" | "starting" | "resolving" | "monthly" | "top" | "completed" | "failed";

type Summary = {
  savedMonthly: number;
  savedTop: number;
  matched: number;
  unmatchedSample: string[];
  unmatchedCount: number;
};

function FakturaImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const startFn = useServerFn(startInvoiceImportJob);
  const resolveFn = useServerFn(resolveDeliveryNos);
  const uploadMonthlyFn = useServerFn(uploadSalesMonthlyChunk);
  const uploadTopFn = useServerFn(uploadSalesTopProductsChunk);
  const finalizeFn = useServerFn(finalizeInvoiceImportJob);

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [stats, setStats] = useState<ParseStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [savedMonthly, setSavedMonthly] = useState(0);
  const [savedTop, setSavedTop] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  async function handleFile(f: File) {
    setFile(f);
    setPhase("idle");
    setSummary(null);
    setErrorMsg(null);
    setSavedMonthly(0);
    setSavedTop(0);
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

  async function runChunkWithRetry<T>(call: () => Promise<T>, label: string): Promise<T> {
    const delays = [500, 1500, 4000];
    let lastErr: any;
    for (let i = 0; i <= delays.length; i++) {
      try {
        return await call();
      } catch (e) {
        lastErr = e;
        if (i === delays.length) break;
        await new Promise((r) => setTimeout(r, delays[i]));
      }
    }
    throw new Error(`${label}: ${lastErr?.message ?? "ukendt fejl"}`);
  }

  async function handleSave() {
    if (!monthly.length && !topProducts.length) return;
    setPhase("starting");
    setSavedMonthly(0);
    setSavedTop(0);
    setErrorMsg(null);
    setSummary(null);

    let jobId: string | null = null;
    try {
      const start = await startFn({
        data: { totalMonthly: monthly.length, totalTop: topProducts.length },
      });
      jobId = start.jobId;

      setPhase("resolving");
      const allDeliveryNos = Array.from(
        new Set([
          ...monthly.map((r) => r.visma_delivery_no),
          ...topProducts.map((r) => r.visma_delivery_no),
        ].filter(Boolean)),
      );
      const { map, unmatched } = await resolveFn({
        data: { jobId, deliveryNos: allDeliveryNos },
      });

      // Enrich rows in memory (location_id/company_id may be null)
      const resolvedMonthly: ResolvedMonthlyRow[] = monthly.map((r) => {
        const hit = map[r.visma_delivery_no];
        return { ...r, location_id: hit?.location_id ?? null, company_id: hit?.company_id ?? null };
      });
      const resolvedTop: ResolvedTopProductRow[] = topProducts.map((r) => {
        const hit = map[r.visma_delivery_no];
        return { ...r, location_id: hit?.location_id ?? null };
      });

      setPhase("monthly");
      for (let i = 0; i < resolvedMonthly.length; i += CHUNK) {
        const chunk = resolvedMonthly.slice(i, i + CHUNK);
        const res = await runChunkWithRetry(
          () => uploadMonthlyFn({ data: { jobId: jobId!, rows: chunk } }),
          `Månedsdata chunk ${Math.floor(i / CHUNK) + 1}`,
        );
        setSavedMonthly((s) => s + res.saved);
      }

      setPhase("top");
      for (let i = 0; i < resolvedTop.length; i += CHUNK) {
        const chunk = resolvedTop.slice(i, i + CHUNK);
        const res = await runChunkWithRetry(
          () => uploadTopFn({ data: { jobId: jobId!, rows: chunk } }),
          `Top-varer chunk ${Math.floor(i / CHUNK) + 1}`,
        );
        setSavedTop((s) => s + res.saved);
      }

      await finalizeFn({ data: { jobId, status: "completed" } });
      setSummary({
        savedMonthly: resolvedMonthly.length,
        savedTop: resolvedTop.length,
        matched: Object.keys(map).length,
        unmatchedSample: unmatched.slice(0, 10),
        unmatchedCount: unmatched.length,
      });
      setPhase("completed");
      toast.success(`Import færdig: ${resolvedMonthly.length} månedsrækker, ${resolvedTop.length} top-varer`);
    } catch (e: any) {
      const msg = e?.message ?? "ukendt fejl";
      setErrorMsg(msg);
      setPhase("failed");
      toast.error("Import fejlede: " + msg);
      if (jobId) {
        try {
          await finalizeFn({ data: { jobId, status: "failed", errorMessage: msg } });
        } catch {}
      }
    }
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isRunning = phase === "starting" || phase === "resolving" || phase === "monthly" || phase === "top";
  const totalRows = monthly.length + topProducts.length;
  const savedRows = savedMonthly + savedTop;
  const pct = totalRows > 0 ? Math.min(100, Math.round((savedRows / totalRows) * 100)) : 0;

  const phaseLabel: Record<Phase, string> = {
    idle: "",
    starting: "Starter…",
    resolving: "Matcher lokationer…",
    monthly: `Gemmer månedsdata (${savedMonthly.toLocaleString("da-DK")} / ${monthly.length.toLocaleString("da-DK")})…`,
    top: `Gemmer top-varer (${savedTop.toLocaleString("da-DK")} / ${topProducts.length.toLocaleString("da-DK")})…`,
    completed: "Færdig",
    failed: "Fejlet",
  };

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
          Upload rå fakturajournal fra Visma (xlsx eller csv). Filen aggregeres i browseren og uploades i bidder à {CHUNK.toLocaleString("da-DK")} rækker, som serveren upserter i batches à 500.
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
            disabled={parsing || isRunning}
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
              <li>🏢 Firma-filter: kun firma <b className="text-foreground">10</b> importeres · <b className="text-foreground">{stats.skippedFirma.toLocaleString("da-DK")}</b> linjer sprunget over pga. fremmed firma-kode{stats.skippedFirmaSamples.length > 0 && <> (set: {stats.skippedFirmaSamples.join(", ")})</>}</li>
              <li>🏷️ <b className="text-foreground">{stats.uniqueDeliveryNos.toLocaleString("da-DK")}</b> unikke lev.nr. i fil</li>
              <li>📅 Periode: <b className="text-foreground">{stats.periodFrom ?? "?"}</b> → <b className="text-foreground">{stats.periodTo ?? "?"}</b></li>
              <li>💰 Samlet omsætning: <b className="text-foreground">{fmtKr(stats.totalRevenue)}</b></li>
              <li>🔧 Interne service-posteringer (Beløb=0, DB≠0): <b className="text-foreground">{stats.internalServicePostings.toLocaleString("da-DK")}</b> linjer</li>
              <li>📊 Genererer: <b className="text-foreground">{monthly.length.toLocaleString("da-DK")}</b> månedsrækker · <b className="text-foreground">{topProducts.length.toLocaleString("da-DK")}</b> top-vare-rækker</li>
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!monthly.length || parsing || isRunning}>
            {isRunning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {phaseLabel[phase]} {pct}%</>
            ) : (
              <><FileUp className="h-4 w-4 mr-2" /> Gem aggregeret data</>
            )}
          </Button>
        </div>

        {isRunning && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{phaseLabel[phase]}</span>
              <span className="text-muted-foreground">{savedRows.toLocaleString("da-DK")} / {totalRows.toLocaleString("da-DK")} rækker</span>
            </div>
            <Progress value={pct} />
            <p className="text-xs text-muted-foreground">
              Månedsdata: {savedMonthly.toLocaleString("da-DK")} / {monthly.length.toLocaleString("da-DK")} ·
              Top-varer: {savedTop.toLocaleString("da-DK")} / {topProducts.length.toLocaleString("da-DK")}
            </p>
            <p className="text-xs text-muted-foreground">Hold fanen åben mens chunks uploades — luk ikke browseren.</p>
          </div>
        )}

        {phase === "completed" && summary && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium text-green-900 dark:text-green-100">
              <CheckCircle2 className="h-4 w-4" /> Import færdig
            </div>
            <ul className="space-y-1 text-green-900/80 dark:text-green-100/80">
              <li>✓ {summary.savedMonthly.toLocaleString("da-DK")} månedsrækker gemt/opdateret</li>
              <li>✓ {summary.savedTop.toLocaleString("da-DK")} top-vare-rækker gemt</li>
              <li>✓ {summary.matched.toLocaleString("da-DK")} lev.nr. matchet til lokationer</li>
              {stats && stats.invalidLines > 0 && (
                <li>ℹ️ {stats.invalidLines.toLocaleString("da-DK")} ugyldige linjer sprunget over (Vismas subtotal-/sammendragsrækker)</li>
              )}
              {summary.unmatchedCount > 0 && (
                <li>⚠️ {summary.unmatchedCount.toLocaleString("da-DK")} lev.nr. uden match (gemt med tomt lokations-link): <span className="font-mono text-xs">{summary.unmatchedSample.join(", ")}{summary.unmatchedCount > summary.unmatchedSample.length && "…"}</span></li>
              )}
            </ul>
          </div>
        )}

        {phase === "failed" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
            <div className="font-medium text-destructive">Import fejlede</div>
            <p className="text-xs text-muted-foreground mt-1">{errorMsg}</p>
            <p className="text-xs text-muted-foreground mt-2">Allerede gemte rækker er bevaret. Tryk på Gem igen for at fortsætte — upsert er idempotent.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
