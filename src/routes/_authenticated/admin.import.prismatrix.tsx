import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { importAgreementPricing } from "@/lib/agreement-pricing-import.functions";
import { parseDanishDateIso as toIsoDate } from "@/lib/invoice-parse";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileUp, Loader2, Tag, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import/prismatrix")({
  component: PrismatrixImportSide,
});

// Bevidst skånsom normalisering: behold tegn som % og / så "Rab %" kan mappes.
// Kun whitespace strippes og case ensartes; æøå translittereres så headers med
// danske bogstaver fortsat matcher.
function normCol(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    // Strip punktum og bindestreg så "Kundepris-gr. 1", "Fakt. kundenr"
    // og lignende varianter rammer aliaserne uden at vi skal opliste hver
    // tegnsætnings-variant. % beholdes (kritisk for "Rab %").
    .replace(/[.\-]/g, "");
}


const PRICING_ALIASES: Record<string, string> = {
  kundeprisgruppe1: "kundeprisgruppe1",
  kundeprisgr1: "kundeprisgruppe1",
  kpg1: "kundeprisgruppe1",
  kundeprisgruppe2: "kundeprisgruppe2",
  kundeprisgr2: "kundeprisgruppe2",
  kpg2: "kundeprisgruppe2",
  produktprisgruppe1: "produktprisgruppe1",
  produktprisgruppe2: "produktprisgruppe2",
  produktprisgruppe3: "produktprisgruppe3",
  varenr: "varenr",
  varenummer: "varenr",
  beskrivelse: "beskrivelse",
  varebeskrivelse: "beskrivelse",
  // Rab kr — flere skrivemåder (punktum/streg er allerede strippet i normCol)
  rabkr: "rab_kr",
  rabatkr: "rab_kr",
  // Rab % — KRITISK, behold %-tegnet i nøglen
  "rab%": "rab_pct",
  "rabat%": "rab_pct",
  rabpct: "rab_pct",
  rabprocent: "rab_pct",
  rabatpct: "rab_pct",
  rabatprocent: "rab_pct",
  udsalgspris: "udsalgspris",
  udlejningspris: "udlejningspris",
  kampagne: "kampagne",
  kommentar: "kommentar",
  fradato: "fra_dato",
  tildato: "til_dato",
  // Fakturerings-kundenr — alle gængse forkortelser
  fakkundenr: "fak_kundenr",
  faktkundenr: "fak_kundenr",
  fakturakundenr: "fak_kundenr",
  faktureringskundenr: "fak_kundenr",
  fakturereskundenr: "fak_kundenr",
};


const PRICING_ANCHORS = [
  "kundeprisgruppe2",
  "kundeprisgruppe1",
  "rab%",
  "rabpct",
  "rabkr",
  "varenr",
  "udsalgspris",
];

const FORCE_TEXT = new Set([
  "kundeprisgruppe1",
  "kundeprisgruppe2",
  "varenr",
  "fak_kundenr",
  "produktprisgruppe1",
  "produktprisgruppe2",
  "produktprisgruppe3",
]);

const DATE_FIELDS = new Set(["fra_dato", "til_dato"]);
const NUMBER_FIELDS = new Set(["rab_kr", "rab_pct", "udsalgspris", "udlejningspris"]);

const PRICING_EXPECTED = [
  "kundeprisgruppe1",
  "kundeprisgruppe2",
  "fak_kundenr",
  "produktprisgruppe1",
  "produktprisgruppe2",
  "produktprisgruppe3",
  "varenr",
  "beskrivelse",
  "rab_kr",
  "rab_pct",
  "udsalgspris",
  "udlejningspris",
  "kampagne",
  "kommentar",
  "fra_dato",
  "til_dato",
];


function readSheetGrid(file: File): Promise<any[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (e) => {
      try {
        const buf = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const grid = XLSX.utils.sheet_to_json<any[]>(ws, {
          header: 1,
          defval: "",
          raw: false,
          blankrows: false,
        });
        resolve(grid as any[][]);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function detectHeaderRow(
  grid: any[][],
  anchors: string[],
): { rowIndex: number; cols: string[]; score: number } | null {
  const SCAN = Math.min(grid.length, 25);
  let best = { rowIndex: -1, score: 0, cols: [] as string[] };
  for (let i = 0; i < SCAN; i++) {
    const row = grid[i] ?? [];
    const cols = row.map((c) => String(c ?? "").trim());
    const norm = cols.map(normCol).filter(Boolean);
    const score = norm.filter((c) => anchors.includes(c)).length;
    if (score > best.score) best = { rowIndex: i, score, cols };
  }
  return best.score >= 1 ? best : null;
}


function toNumber(val: any): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return isFinite(val) ? val : null;
  const s0 = String(val).trim();
  if (!s0) return null;
  // Strip percent signs and currency markers
  const cleaned0 = s0.replace(/%/g, "").replace(/kr\.?/gi, "").trim();
  const n0 = Number(cleaned0);
  if (isFinite(n0)) return n0;
  const s = cleaned0.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

function forceText(val: any): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s || null;
}

type MappingResult = {
  headerRow: number;
  rows: Record<string, any>[];
  mapped: string[];
  missing: string[];
  unknown: string[];
  distinctKundeprisgruppe2: number;
};

function mapSheet(grid: any[][]): MappingResult | { error: string } {
  const header = detectHeaderRow(grid, PRICING_ANCHORS);
  if (!header) {
    return { error: "Kunne ikke finde header-rækken (ingen ankerfelter matchede)" };
  }
  const indexByCanonical = new Map<string, number>();
  const unknown: string[] = [];
  header.cols.forEach((c, i) => {
    const k = normCol(c);
    if (!k) return;
    const canonical = PRICING_ALIASES[k];
    if (canonical) {
      if (!indexByCanonical.has(canonical)) indexByCanonical.set(canonical, i);
    } else {
      unknown.push(c);
    }
  });
  const mapped = Array.from(indexByCanonical.keys());
  const missing = PRICING_EXPECTED.filter((c) => !indexByCanonical.has(c));

  const rows: Record<string, any>[] = [];
  const distinctKpg2 = new Set<string>();
  for (let i = header.rowIndex + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((v) => v == null || String(v).trim() === "")) continue;
    const obj: Record<string, any> = {};
    for (const [canonical, idx] of indexByCanonical) {
      const raw = r[idx];
      if (FORCE_TEXT.has(canonical)) {
        obj[canonical] = forceText(raw);
      } else if (DATE_FIELDS.has(canonical)) {
        obj[canonical] = toIsoDate(raw);
      } else if (NUMBER_FIELDS.has(canonical)) {
        obj[canonical] = toNumber(raw);
      } else {
        obj[canonical] = forceText(raw);
      }
    }
    if (obj.kundeprisgruppe2) distinctKpg2.add(obj.kundeprisgruppe2);
    rows.push(obj);
  }
  return {
    headerRow: header.rowIndex,
    rows,
    mapped,
    missing,
    unknown,
    distinctKundeprisgruppe2: distinctKpg2.size,
  };
}

type FileState = {
  file: File | null;
  diag: MappingResult | null;
  error: string | null;
};

function PrismatrixImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<FileState>({ file: null, diag: null, error: null });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    rowsParsed: number;
    rowsBuilt: number;
    skippedEmpty: number;
    upserted: number;
    markedUdgaaet: number;
    countBefore: number;
    countAfter: number;
  } | null>(null);
  const importFn = useServerFn(importAgreementPricing);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  async function handleFile(f: File) {
    try {
      const grid = await readSheetGrid(f);
      const res = mapSheet(grid);
      if ("error" in res) {
        setState({ file: f, diag: null, error: res.error });
        toast.error("Prismatrix: " + res.error);
        return;
      }
      setState({ file: f, diag: res, error: null });
      toast.success(
        `Prismatrix: header på række ${res.headerRow + 1}, ${res.rows.length} datarækker, ${res.mapped.length} felter mappet, ${res.distinctKundeprisgruppe2} kundeprisgrupper`,
      );
    } catch (e: any) {
      setState({ file: f, diag: null, error: e?.message ?? "ukendt fejl" });
      toast.error("Prismatrix: " + (e?.message ?? "kunne ikke læse fil"));
    }
  }

  async function runImport() {
    if (!state.diag) {
      toast.error("Upload prismatrix-fil før import");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await importFn({
        data: {
          rows: state.diag.rows as any,
          diagnostics: {
            file: state.file?.name,
            headerRow: state.diag.headerRow,
            mapped: state.diag.mapped,
            missing: state.diag.missing,
            unknown: state.diag.unknown,
            rowCount: state.diag.rows.length,
            distinctKundeprisgruppe2: state.diag.distinctKundeprisgruppe2,
          },
        },
      });
      setResult(res);
      toast.success(
        `Prismatrix-import gennemført: ${res.upserted} rækker (tabel: ${res.countBefore} → ${res.countAfter})`,
      );
    } catch (e: any) {
      toast.error("Fejl: " + (e?.message ?? "ukendt fejl"));
    } finally {
      setBusy(false);
    }
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const canRun = !busy && !!state.diag?.rows.length;

  return (
    <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto pb-24 md:pb-8">
      <Link
        to="/admin/import"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Tilbage til importvalg
      </Link>
      <h1 className="text-2xl md:text-3xl font-semibold mb-2 flex items-center gap-2">
        <Tag className="h-6 w-6" /> Pris- og rabatmatrix
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Importér prismatrix til <code>agreement_pricing</code>. Header-rækken findes automatisk via
        ankerfelter (typisk række 2), kolonner mappes via alias, ukendte ignoreres. En afledt
        <code className="mx-1">rabat_kategori</code> beregnes pr. række.
      </p>

      <Card className="p-6 space-y-6">
        <div>
          <Label className="mb-2 block font-medium">Pris- og rabatmatrix (XLSX)</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Titel-rækken "Pris- og rabatmatrix" må gerne stå i række 1 — vi finder selv de rigtige
            headere længere nede.
          </p>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            disabled={busy}
          />
          {state.file && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <FileUp className="h-3.5 w-3.5" /> {state.file.name}
            </p>
          )}
          {state.error && (
            <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> {state.error}
            </p>
          )}
          {state.diag && (
            <div className="text-xs text-muted-foreground mt-2 space-y-0.5 border-l-2 border-muted pl-3">
              <div>
                Header-række: <strong>{state.diag.headerRow + 1}</strong>
              </div>
              <div>
                Datarækker: <strong>{state.diag.rows.length}</strong>
              </div>
              <div>
                Distinkte kundeprisgrupper:{" "}
                <strong>{state.diag.distinctKundeprisgruppe2}</strong>
              </div>
              <div>
                Mappede felter ({state.diag.mapped.length}):{" "}
                <span className="text-foreground">{state.diag.mapped.join(", ") || "—"}</span>
              </div>
              {state.diag.missing.length > 0 && (
                <div className="text-amber-700">
                  Manglende (bliver null): {state.diag.missing.join(", ")}
                </div>
              )}
              {state.diag.unknown.length > 0 && (
                <div>Ignorerede kolonner: {state.diag.unknown.join(", ")}</div>
              )}
            </div>
          )}
        </div>

        <div className="pt-4 border-t flex items-center gap-3">
          <Button onClick={runImport} disabled={!canRun}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Tag className="h-4 w-4 mr-2" />
            )}
            {busy ? "Importerer…" : "Importér"}
          </Button>
          {canRun && !result && (
            <span className="text-xs text-muted-foreground">
              {state.diag?.rows.length ?? 0} rækker upserter
            </span>
          )}
        </div>
      </Card>

      {result && (
        <Card className="p-6 mt-4 border-emerald-300 bg-emerald-50">
          <h2 className="font-semibold mb-3 flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="h-5 w-5" /> Import gennemført
          </h2>
          <ul className="text-sm space-y-1 text-emerald-900">
            <li>
              <strong>{result.upserted}</strong> rækker upsertet i{" "}
              <code>agreement_pricing</code> (parsed: {result.rowsParsed}, byggede:{" "}
              {result.rowsBuilt}, tomme sprunget over: {result.skippedEmpty})
            </li>
            <li>
              Tabel-tælling: <strong>{result.countBefore}</strong> →{" "}
              <strong>{result.countAfter}</strong>
            </li>
            <li>
              <strong>{result.markedUdgaaet}</strong> rækker fra tidligere import flagget{" "}
              <em>udgået</em>
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}
