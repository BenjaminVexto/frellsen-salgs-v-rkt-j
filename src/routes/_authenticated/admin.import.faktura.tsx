import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileUp, Loader2, CheckCircle2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { parseAndAggregate, type ParseStats } from "@/lib/invoice-parse";
import {
  upsertInvoiceAggregates,
  type ImportInvoiceResult,
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
  const upsertFn = useServerFn(upsertInvoiceAggregates);

  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<ParseStats | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [result, setResult] = useState<ImportInvoiceResult | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  async function handleFile(f: File) {
    setFile(f);
    setResult(null);
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
    setSaving(true);
    try {
      const res = await upsertFn({ data: { monthly, topProducts } });
      setResult(res);
      toast.success(`Gemt: ${res.monthlyUpserted} månedsrækker, ${res.topProductsUpserted} top-varer`);
    } catch (e: any) {
      toast.error("Kunne ikke gemme: " + (e?.message ?? "ukendt fejl"));
    } finally {
      setSaving(false);
    }
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
          Upload rå fakturajournal fra Visma (xlsx eller csv). Filen aggregeres pr. lev.nr. × måned × produktgruppe og gemmes idempotent.
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
            disabled={parsing || saving}
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
              <li>📄 <b className="text-foreground">{stats.linesRead.toLocaleString("da-DK")}</b> faktura-linjer læst{stats.invalidLines > 0 && <> · {stats.invalidLines} ugyldige sprunget over</>}</li>
              <li>🏷️ <b className="text-foreground">{stats.uniqueDeliveryNos.toLocaleString("da-DK")}</b> unikke lev.nr. i fil</li>
              <li>📅 Periode: <b className="text-foreground">{stats.periodFrom ?? "?"}</b> → <b className="text-foreground">{stats.periodTo ?? "?"}</b></li>
              <li>💰 Samlet omsætning: <b className="text-foreground">{fmtKr(stats.totalRevenue)}</b></li>
              <li>🔧 Interne service-posteringer (Beløb=0, DB≠0): <b className="text-foreground">{stats.internalServicePostings.toLocaleString("da-DK")}</b> linjer</li>
              <li>📊 Genererer: <b className="text-foreground">{monthly.length.toLocaleString("da-DK")}</b> månedsrækker · <b className="text-foreground">{topProducts.length.toLocaleString("da-DK")}</b> top-vare-rækker</li>
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={!monthly.length || saving || parsing}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gemmer…</> : <><FileUp className="h-4 w-4 mr-2" /> Gem aggregeret data</>}
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium text-green-900 dark:text-green-100">
              <CheckCircle2 className="h-4 w-4" /> Import færdig
            </div>
            <ul className="space-y-1 text-green-900/80 dark:text-green-100/80">
              <li>✓ {result.monthlyUpserted.toLocaleString("da-DK")} månedsrækker gemt/opdateret</li>
              <li>✓ {result.topProductsUpserted.toLocaleString("da-DK")} top-vare-rækker gemt</li>
              <li>✓ {result.locationsMatched.toLocaleString("da-DK")} lev.nr. matchet til lokationer</li>
              {result.deliveryNosWithoutMatch.length > 0 && (
                <li>⚠️ {result.deliveryNosWithoutMatch.length}+ lev.nr. uden match (sprunget over): <span className="font-mono text-xs">{result.deliveryNosWithoutMatch.slice(0, 10).join(", ")}{result.deliveryNosWithoutMatch.length > 10 && "…"}</span></li>
              )}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
