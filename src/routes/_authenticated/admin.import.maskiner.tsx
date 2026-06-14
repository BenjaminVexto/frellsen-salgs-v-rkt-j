import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { importMachines } from "@/lib/machines-import.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileUp, Loader2, Cog, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import/maskiner")({
  component: MaskinerImportSide,
});

// ---- Normalisering af kolonnenavne ----
function normCol(s: string): string {
  return s
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Alias-map: normaliseret header → canonical felt.
// Manglende canonical → null. Kolonner uden alias-match → ignoreres.
const MACHINE_ALIASES: Record<string, string> = {
  navn: "navn",
  firma: "navn",
  fakkundenr: "fak_kundenr",
  fakturereskundenr: "fak_kundenr",
  levkundenr: "lev_kundenr",
  beskrivelse: "beskrivelse",
  varebeskrivelse: "beskrivelse",
  udlaanstype: "udlanstype",
  udlaanstypetransgr2: "udlanstype",
  varenr: "varenr",
  serienrwit: "serienr",
  serienr: "serienr",
  ordrenr: "ordrenr",
  koebtdatodato2: "kobt_dato",
  koebtdato: "kobt_dato",
  leaselejedato4: "lease_leje_dato",
  lejetdato: "lease_leje_dato",
  adresselinje2: "adresselinje2",
  aendretdato: "aendret_dato",
  status: "status",
  taellerstand: "taellerstand",
};

const ENRICHMENT_ALIASES: Record<string, string> = {
  serienr: "serienr",
  serienrwit: "serienr",
  senstetaelleraflaesningsdato: "taelleraflaesning",
  senestetaelleraflaesningsdato: "taelleraflaesning",
  bindingophoer: "binding_ophor",
  bindingsophoer: "binding_ophor",
  beregnetslutdato: "beregnet_slutdato",
  bemaerkning: "bemaerkning_handlingsdato",
  bemaerkninghandlingsdato: "bemaerkning_handlingsdato",
  handlingsdato: "bemaerkning_handlingsdato",
};

const MACHINE_ANCHORS = ["levkundenr", "fakkundenr", "serienr", "serienrwit", "varenr"];
const ENRICHMENT_ANCHORS = [
  "serienr",
  "serienrwit",
  "senstetaelleraflaesningsdato",
  "senestetaelleraflaesningsdato",
];

const FORCE_TEXT = new Set(["serienr", "lev_kundenr", "fak_kundenr", "varenr"]);
const DATE_FIELDS = new Set([
  "kobt_dato",
  "lease_leje_dato",
  "aendret_dato",
  "taelleraflaesning",
  "binding_ophor",
  "beregnet_slutdato",
]);
const NUMBER_FIELDS = new Set(["taellerstand"]);

// "2027-07 juli" / "2025-07 Juli - se aftale" / "2024-12" → "2024-12-01"
// Værdier uden YYYY-MM i starten (fx "Leje", "Udlån") → null
function extractHandlingsdato(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{4})-(\d{1,2})\b/);
  if (!m) return null;
  const y = m[1];
  const mo = m[2].padStart(2, "0");
  const moNum = parseInt(mo, 10);
  if (moNum < 1 || moNum > 12) return null;
  return `${y}-${mo}-01`;
}

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
  return best.score >= 2 ? best : null;
}

function toIsoDate(val: any): string | null {
  if (val == null || val === "") return null;
  if (val instanceof Date && !isNaN(+val)) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (!s) return null;
  // ISO først
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // DK: DD-MM-YYYY / DD.MM.YYYY / DD/MM/YYYY
  const dk = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})/);
  if (dk) {
    let [, d, m, y] = dk;
    if (y.length === 2) y = (parseInt(y) > 50 ? "19" : "20") + y;
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  if (!isNaN(+dt)) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

function toNumber(val: any): number | null {
  if (val == null || val === "") return null;
  if (typeof val === "number") return isFinite(val) ? val : null;
  const s0 = String(val).trim();
  if (!s0) return null;
  const n0 = Number(s0);
  if (isFinite(n0)) return n0;
  const s = s0.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
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
};

function mapSheet(
  grid: any[][],
  aliases: Record<string, string>,
  anchors: string[],
  expectedCanonical: string[],
): MappingResult | { error: string } {
  const header = detectHeaderRow(grid, anchors);
  if (!header) {
    return { error: "Kunne ikke finde header-rækken (ingen ankerfelter matchede)" };
  }
  const indexByCanonical = new Map<string, number>();
  const unknown: string[] = [];
  header.cols.forEach((c, i) => {
    const k = normCol(c);
    if (!k) return;
    const canonical = aliases[k];
    if (canonical) {
      if (!indexByCanonical.has(canonical)) indexByCanonical.set(canonical, i);
    } else {
      unknown.push(c);
    }
  });
  const mapped = Array.from(indexByCanonical.keys());
  const missing = expectedCanonical.filter((c) => !indexByCanonical.has(c));

  const rows: Record<string, any>[] = [];
  for (let i = header.rowIndex + 1; i < grid.length; i++) {
    const r = grid[i];
    if (!r || r.every((v) => v == null || String(v).trim() === "")) continue;
    const obj: Record<string, any> = {};
    for (const [canonical, idx] of indexByCanonical) {
      const raw = r[idx];
      if (canonical === "bemaerkning_handlingsdato") {
        const rawText = forceText(raw);
        obj["handlingsdato_raw"] = rawText;
        obj["handlingsdato"] = extractHandlingsdato(rawText);
      } else if (FORCE_TEXT.has(canonical)) {
        obj[canonical] = forceText(raw);
      } else if (DATE_FIELDS.has(canonical)) {
        obj[canonical] = toIsoDate(raw);
      } else if (NUMBER_FIELDS.has(canonical)) {
        obj[canonical] = toNumber(raw);
      } else {
        const s = forceText(raw);
        obj[canonical] = s;
      }
    }
    rows.push(obj);
  }
  return { headerRow: header.rowIndex, rows, mapped, missing, unknown };
}

const MACHINE_EXPECTED = [
  "ordrenr",
  "varenr",
  "beskrivelse",
  "serienr",
  "udlanstype",
  "navn",
  "fak_kundenr",
  "lev_kundenr",
  "kobt_dato",
  "lease_leje_dato",
  "adresselinje2",
  "aendret_dato",
  "status",
  "taellerstand",
];
const ENRICHMENT_EXPECTED = ["serienr", "taelleraflaesning"];

type FileState = {
  file: File | null;
  diag: MappingResult | null;
  error: string | null;
};

function MaskinerImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [machineState, setMachineState] = useState<FileState>({ file: null, diag: null, error: null });
  const [enrichState, setEnrichState] = useState<FileState>({ file: null, diag: null, error: null });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    machinesUpserted: number;
    enrichmentUpserted: number;
    machineRowsParsed: number;
    enrichmentRowsParsed: number;
  } | null>(null);
  const importFn = useServerFn(importMachines);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  async function handleFile(
    f: File,
    aliases: Record<string, string>,
    anchors: string[],
    expected: string[],
    setter: (s: FileState) => void,
    label: string,
  ) {
    try {
      const grid = await readSheetGrid(f);
      const res = mapSheet(grid, aliases, anchors, expected);
      if ("error" in res) {
        setter({ file: f, diag: null, error: res.error });
        toast.error(`${label}: ${res.error}`);
        return;
      }
      setter({ file: f, diag: res, error: null });
      toast.success(
        `${label}: header på række ${res.headerRow + 1}, ${res.rows.length} datarækker, ${res.mapped.length} felter mappet`,
      );
    } catch (e: any) {
      setter({ file: f, diag: null, error: e?.message ?? "ukendt fejl" });
      toast.error(`${label}: ${e?.message ?? "kunne ikke læse fil"}`);
    }
  }

  async function runImport() {
    if (!machineState.diag && !enrichState.diag) {
      toast.error("Upload mindst én fil før import");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await importFn({
        data: {
          machineRows: machineState.diag?.rows ?? [],
          enrichmentRows: (enrichState.diag?.rows ?? []).filter((r) => r.serienr) as any,
          diagnostics: {
            machinesFile: machineState.file?.name,
            enrichmentFile: enrichState.file?.name,
            machinesHeaderRow: machineState.diag?.headerRow,
            enrichmentHeaderRow: enrichState.diag?.headerRow,
            machinesMapped: machineState.diag?.mapped,
            enrichmentMapped: enrichState.diag?.mapped,
            machinesMissing: machineState.diag?.missing,
            enrichmentMissing: enrichState.diag?.missing,
          },
        },
      });
      setResult(res);
      toast.success("Maskin-import gennemført");
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

  const canRun =
    !busy &&
    (!!machineState.diag?.rows.length || !!enrichState.diag?.rows.length);

  return (
    <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto pb-24 md:pb-8">
      <Link
        to="/admin/import"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="h-4 w-4" /> Tilbage til importvalg
      </Link>
      <h1 className="text-2xl md:text-3xl font-semibold mb-2 flex items-center gap-2">
        <Cog className="h-6 w-6" /> Maskiner & Wittenborg-enrichment
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Importér Maskinlisten og Wittenborg SN-listen. Filerne kan uploades i vilkårlig rækkefølge —
        header-rækken findes automatisk via ankerfelter, og felter mappes via alias.
      </p>

      <Card className="p-6 space-y-6">
        <FileSlot
          label="Maskinliste (Visma)"
          help="XLSX/XLS. Header findes automatisk (typisk række 2). Ekstra kolonner ignoreres."
          state={machineState}
          onFile={(f) =>
            handleFile(f, MACHINE_ALIASES, MACHINE_ANCHORS, MACHINE_EXPECTED, setMachineState, "Maskinliste")
          }
          disabled={busy}
        />
        <FileSlot
          label="Wittenborg SN"
          help="XLSX/XLS. Header findes automatisk. Joines med maskiner via serienr."
          state={enrichState}
          onFile={(f) =>
            handleFile(
              f,
              ENRICHMENT_ALIASES,
              ENRICHMENT_ANCHORS,
              ENRICHMENT_EXPECTED,
              setEnrichState,
              "Wittenborg SN",
            )
          }
          disabled={busy}
        />

        <div className="pt-4 border-t flex items-center gap-3">
          <Button onClick={runImport} disabled={!canRun}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Cog className="h-4 w-4 mr-2" />
            )}
            {busy ? "Importerer…" : "Importér"}
          </Button>
          {canRun && !result && (
            <span className="text-xs text-muted-foreground">
              {machineState.diag?.rows.length ?? 0} maskinrækker +{" "}
              {enrichState.diag?.rows.length ?? 0} enrichment-rækker upserter
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
              <strong>{result.machinesUpserted}</strong> rækker upsertet i <code>machines</code>{" "}
              (parsed: {result.machineRowsParsed})
            </li>
            <li>
              <strong>{result.enrichmentUpserted}</strong> rækker upsertet i{" "}
              <code>machine_enrichment</code> (parsed: {result.enrichmentRowsParsed})
            </li>
          </ul>
        </Card>
      )}
    </div>
  );
}

function FileSlot({
  label,
  help,
  state,
  onFile,
  disabled,
}: {
  label: string;
  help: string;
  state: FileState;
  onFile: (f: File) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <Label className="mb-2 block font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground mb-2">{help}</p>
      <Input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        disabled={disabled}
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
          <div>Header-række: <strong>{state.diag.headerRow + 1}</strong></div>
          <div>Datarækker: <strong>{state.diag.rows.length}</strong></div>
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
  );
}
