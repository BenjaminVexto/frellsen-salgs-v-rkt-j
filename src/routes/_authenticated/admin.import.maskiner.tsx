import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { importMachines } from "@/lib/machines-import.functions";
import { recomputeAllCompanyStatuses } from "@/lib/recompute.functions";

import {
  parseDanishDateIso as toIsoDate,
  detectDateFormat,
  parseDateWithFormat,
} from "@/lib/invoice-parse";
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
  adresselinje2: "adresselinje2",
  aendretdato: "aendret_dato",
  status: "status",
  maskinstatus: "status",
};

const ENRICHMENT_ALIASES: Record<string, string> = {
  // Identifikation
  serienr: "serienr",
  serienrwit: "serienr",
  // Maskininfo
  maskintypeg2: "maskin_type",
  typemaskg2: "maskin_type", // UDEN SN: "Type mask (G2)"
  oplysning1tilbehoer: "tilbehor",
  emailadresse: "email",
  levkundenr: "lev_kundenr",
  levkundnr: "lev_kundenr", // UDEN SN: "Lev kundnr"
  fakturereskundenr: "fak_kundenr",
  status: "status",
  kundeprisgruppe1: "kundeprisgruppe1",
  responsgr6: "respons",
  navn: "navn",
  reservedeleg3: "reservedele",
  gruppe3: "reservedele", // UDEN SN: "Gruppe 3"
  aftaletypeg4: "aftale_type",
  gruppe4: "aftale_type", // UDEN SN: "Gruppe 4"
  chf: "chf",
  // Datoer
  leasetdato: "leaset_dato",
  koebtdatodato2: "kobt_dato",
  leaselejedato4: "lease_leje_dato",
  lejeleasdato4: "lease_leje_dato", // UDEN SN: "Leje/leas. Dato 4"
  beregnetstartdato: "beregnet_startdato",
  bindingophoerleje: "binding_ophor",
  beregnetslutdato: "beregnet_slutdato",
  // Bemærkning med dato-tekst
  bemaerkninghandlingsdato: "bemaerkning_handlingsdato",
  // Tæller
  senestetaellerstand: "taellerstand",
  senstetaelleraflaesningsdato: "taelleraflaesning",
  senestetaelleraflaesningsdato: "taelleraflaesning",
};

const MACHINE_ANCHORS = ["levkundenr", "fakkundenr", "serienr", "serienrwit", "varenr"];
const ENRICHMENT_ANCHORS = [
  "serienr",
  "serienrwit",
  "maskintypeg2",
  "typemaskg2",
  "levkundnr",
  "bindingophoerleje",
  "senstetaelleraflaesningsdato",
  "senestetaelleraflaesningsdato",
];

const FORCE_TEXT = new Set([
  "serienr",
  "lev_kundenr",
  "fak_kundenr",
  "varenr",
  "chf",
  "kundeprisgruppe1",
]);
const DATE_FIELDS = new Set([
  "aendret_dato",
  "taelleraflaesning",
  "binding_ophor",
  "beregnet_slutdato",
  "beregnet_startdato",
  "leaset_dato",
  "kobt_dato",
  "lease_leje_dato",
]);
const NUMBER_FIELDS = new Set(["taellerstand"]);

// Enrichment-specifikke dato-felter (aendret_dato er kun i maskinlisten
// og har en anden format-oprindelse — se nedenfor).
const ENRICHMENT_DATE_FIELDS = new Set([
  "leaset_dato",
  "kobt_dato",
  "lease_leje_dato",
  "beregnet_startdato",
  "binding_ophor",
  "beregnet_slutdato",
  "taelleraflaesning",
]);

// ---- Selv-verificerende dato-formatdetektor for enrichment-filer ----
// Visma-eksporter er ikke garanteret ens formaterede. Vi afgør dansk vs.
// amerikansk rækkefølge ud fra selve dataen: tal >12 kan ikke være måned.
type DateFormat = "us" | "dk";
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
  dateDetection?: DateFormatDetection;
};

function mapSheet(
  grid: any[][],
  aliases: Record<string, string>,
  anchors: string[],
  expectedCanonical: string[],
  opts: { detectDates?: boolean } = {},
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

  // Formatdetektor: scan alle rå værdier i enrichment-dato-kolonnerne
  // FØR rækkerne bygges, så vi kan bruge det fundne format konsekvent.
  let dateDetection: DateFormatDetection | undefined;
  if (opts.detectDates) {
    const dateColIdxs: number[] = [];
    for (const [canonical, idx] of indexByCanonical) {
      if (ENRICHMENT_DATE_FIELDS.has(canonical)) dateColIdxs.push(idx);
    }
    const rawDateValues: unknown[] = [];
    for (let i = header.rowIndex + 1; i < grid.length; i++) {
      const r = grid[i];
      if (!r) continue;
      for (const idx of dateColIdxs) rawDateValues.push(r[idx]);
    }
    dateDetection = detectDateFormat(rawDateValues);
  }

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
        if (dateDetection && ENRICHMENT_DATE_FIELDS.has(canonical)) {
          obj[canonical] = parseDateWithFormat(raw, dateDetection.format);
        } else {
          obj[canonical] = toIsoDate(raw);
        }
      } else if (NUMBER_FIELDS.has(canonical)) {
        obj[canonical] = toNumber(raw);
      } else {
        const s = forceText(raw);
        obj[canonical] = s;
      }
    }
    rows.push(obj);
  }
  return { headerRow: header.rowIndex, rows, mapped, missing, unknown, dateDetection };
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
  "adresselinje2",
  "aendret_dato",
  "status",
];
const ENRICHMENT_EXPECTED = [
  "serienr",
  "maskin_type",
  "tilbehor",
  "email",
  "lev_kundenr",
  "fak_kundenr",
  "status",
  "kundeprisgruppe1",
  "leaset_dato",
  "respons",
  "navn",
  "reservedele",
  "aftale_type",
  "kobt_dato",
  "lease_leje_dato",
  "beregnet_startdato",
  "binding_ophor",
  "bemaerkning_handlingsdato",
  "beregnet_slutdato",
  "chf",
  "taellerstand",
  "taelleraflaesning",
];

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
  const [enrichUdenSnState, setEnrichUdenSnState] = useState<FileState>({ file: null, diag: null, error: null });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    machinesUpserted: number;
    enrichmentUpserted: number;
    machineRowsParsed: number;
    enrichmentRowsParsed: number;
    machinesActiveBefore?: number;
    enrichmentActiveBefore?: number;
    machinesMarkedUdgaaet?: number;
    enrichmentMarkedUdgaaet?: number;
    machinesReactivated?: number;
    enrichmentReactivated?: number;
  } | null>(null);
  const importFn = useServerFn(importMachines);
  const recomputeStatuses = useServerFn(recomputeAllCompanyStatuses);


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
    opts: { detectDates?: boolean } = {},
  ) {
    try {
      const grid = await readSheetGrid(f);
      const res = mapSheet(grid, aliases, anchors, expected, opts);
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
    if (!machineState.diag && !enrichState.diag && !enrichUdenSnState.diag) {
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
          enrichmentRowsUdenSn: (enrichUdenSnState.diag?.rows ?? []).filter((r) => r.serienr) as any,
          diagnostics: {
            machinesFile: machineState.file?.name,
            enrichmentFile: enrichState.file?.name,
            enrichmentUdenSnFile: enrichUdenSnState.file?.name,
            machinesHeaderRow: machineState.diag?.headerRow,
            enrichmentHeaderRow: enrichState.diag?.headerRow,
            enrichmentUdenSnHeaderRow: enrichUdenSnState.diag?.headerRow,
            machinesMapped: machineState.diag?.mapped,
            enrichmentMapped: enrichState.diag?.mapped,
            enrichmentUdenSnMapped: enrichUdenSnState.diag?.mapped,
            machinesMissing: machineState.diag?.missing,
            enrichmentMissing: enrichState.diag?.missing,
            enrichmentUdenSnMissing: enrichUdenSnState.diag?.missing,
          },
        },
      });
      setResult(res);
      toast.success("Maskin-import gennemført");
      // Genberegn has_active_equipment / customer_type så nye maskiner slår
      // igennem på status uden at vente på næste faktura-import.
      // Ikke-blokerende: en fejl må ikke skygge for selve importen.
      (async () => {
        try {
          const r = await recomputeStatuses();
          if (!r.ok) {
            console.error("[maskiner-import] recompute_all_company_statuses fejlede:", r.error);
          }
        } catch (err) {
          console.error("[maskiner-import] recompute_all_company_statuses kastede:", err);
        }
      })();

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
    (!!machineState.diag?.rows.length ||
      !!enrichState.diag?.rows.length ||
      !!enrichUdenSnState.diag?.rows.length);

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
        Importér Maskinlisten og Wittenborg-listerne (SN + UDEN SN). Filerne kan uploades i vilkårlig
        rækkefølge — header-rækken findes automatisk via ankerfelter, og felter mappes via alias.
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
              { detectDates: true },
            )
          }
          disabled={busy}
        />
        <FileSlot
          label="Wittenborg UDEN SN"
          help="XLSX/XLS. Samme struktur som SN-listen, men mangler binding/slutdato. Parses med samme alias-tabel."
          state={enrichUdenSnState}
          onFile={(f) =>
            handleFile(
              f,
              ENRICHMENT_ALIASES,
              ENRICHMENT_ANCHORS,
              ENRICHMENT_EXPECTED,
              setEnrichUdenSnState,
              "Wittenborg UDEN SN",
              { detectDates: true },
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
              {enrichState.diag?.rows.length ?? 0} SN +{" "}
              {enrichUdenSnState.diag?.rows.length ?? 0} UDEN SN upserter
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
              (parsed: {result.machineRowsParsed}, aktiv før: {result.machinesActiveBefore ?? "–"})
            </li>
            <li>
              <strong>{result.machinesMarkedUdgaaet ?? 0}</strong> maskiner nyflagget{" "}
              <em>udgået</em> · <strong>{result.machinesReactivated ?? 0}</strong> reaktiveret
            </li>
            <li>
              <strong>{result.enrichmentUpserted}</strong> rækker upsertet i{" "}
              <code>machine_enrichment</code> (parsed: {result.enrichmentRowsParsed}, aktiv før:{" "}
              {result.enrichmentActiveBefore ?? "–"})
            </li>
            <li>
              <strong>{result.enrichmentMarkedUdgaaet ?? 0}</strong> enrichment-rækker nyflagget{" "}
              <em>udgået</em> · <strong>{result.enrichmentReactivated ?? 0}</strong> reaktiveret
            </li>
          </ul>
          <p className="text-xs text-emerald-800 mt-3">
            Udgåede rækker slettes ikke — se{" "}
            <Link to="/admin/maskiner/arkiv" className="underline">
              arkivvisning
            </Link>
            .
          </p>

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
          {state.diag.dateDetection && (() => {
            const d = state.diag.dateDetection!;
            const mixed = d.usEvidence > 0 && d.dkEvidence > 0;
            const label = d.format === "us" ? "amerikansk (M/D/Å)" : "dansk (D/M/Å)";
            if (!d.confident || mixed) {
              return (
                <div className="text-amber-700">
                  ⚠ Datoformat kunne ikke bekræftes entydigt ({d.usEvidence} amerikanske vs. {d.dkEvidence} danske eksempler{d.ambiguous ? `, ${d.ambiguous} tvetydige` : ""}) — kontrollér kilden i Visma før import.
                </div>
              );
            }
            return (
              <div>
                Datoformat detekteret: <strong>{label}</strong> — {d.usEvidence + d.dkEvidence} utvetydige eksempler, 0 modstridende{d.ambiguous ? ` (${d.ambiguous} tvetydige ignoreret)` : ""}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
