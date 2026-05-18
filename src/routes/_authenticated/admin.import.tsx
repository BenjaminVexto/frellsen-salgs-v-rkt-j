import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { createImportBatch } from "@/lib/admin-companies.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: ImportSide,
});

type SystemField =
  | "cvr"
  | "name"
  | "address"
  | "zip"
  | "city"
  | "municipality"
  | "industry"
  | "employees"
  | "phone"
  | "email"
  | "website";

const SYSTEM_FIELDS: { key: SystemField; label: string; required?: boolean }[] = [
  { key: "cvr", label: "CVR", required: true },
  { key: "name", label: "Navn", required: true },
  { key: "address", label: "Adresse" },
  { key: "zip", label: "Postnummer" },
  { key: "city", label: "By" },
  { key: "municipality", label: "Kommune" },
  { key: "industry", label: "Branche" },
  { key: "employees", label: "Ansatte" },
  { key: "phone", label: "Telefon" },
  { key: "email", label: "Email" },
  { key: "website", label: "Hjemmeside" },
];

const AUTO_MATCH: Record<SystemField, string[]> = {
  cvr: ["cvr", "cvrnr", "cvr-nr", "cvr_nummer"],
  name: ["navn", "name", "virksomhed", "firmanavn", "selskab"],
  address: ["adresse", "address", "vejnavn", "gade"],
  zip: ["postnummer", "postnr", "zip", "postcode"],
  city: ["by", "city", "bynavn"],
  municipality: ["kommune", "municipality"],
  industry: ["branche", "industri", "industry"],
  employees: ["ansatte", "medarbejdere", "employees", "antal_ansatte"],
  phone: ["telefon", "tlf", "phone", "mobil"],
  email: ["email", "mail", "e-mail"],
  website: ["hjemmeside", "website", "web", "url"],
};

type ParsedRow = Record<string, string>;

interface PreparedRow {
  raw: ParsedRow;
  cvr: string | null;
  data: Partial<Record<SystemField, string | number | null>>;
  isDuplicate: boolean;
  missingCvr: boolean;
  hasError: boolean;
  errorMessage?: string;
}

function ImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<SystemField, string>>>({});
  const [existingCvrs, setExistingCvrs] = useState<Set<string>>(new Set());
  const [includeMissingCvr, setIncludeMissingCvr] = useState(false);
  const [contactLists, setContactLists] = useState<{ id: string; name: string }[]>([]);
  const [sellers, setSellers] = useState<{ id: string; full_name: string }[]>([]);
  const [chosenList, setChosenList] = useState<string>("");
  const [chosenSeller, setChosenSeller] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; failed: number } | null>(null);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  // Trin 1: Parse fil
  function handleFile(f: File) {
    setFile(f);
    Papa.parse<ParsedRow>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hdrs = res.meta.fields ?? [];
        setHeaders(hdrs);
        setRows(res.data);
        // Auto-match
        const auto: Partial<Record<SystemField, string>> = {};
        for (const f of SYSTEM_FIELDS) {
          const found = hdrs.find((h) =>
            AUTO_MATCH[f.key].some((alias) => h.toLowerCase().replace(/[\s-]/g, "_") === alias),
          );
          if (found) auto[f.key] = found;
        }
        setMapping(auto);
        toast.success(`${res.data.length} rækker indlæst`);
        setStep(2);
      },
      error: (err) => toast.error("Kunne ikke læse CSV: " + err.message),
    });
  }

  // Trin 3: Forbered rækker + slå dubletter op
  async function gotoPreview() {
    if (!mapping.cvr || !mapping.name) {
      toast.error("CVR og Navn skal være tilknyttet");
      return;
    }
    const cvrs = rows
      .map((r) => normCvr(r[mapping.cvr!]))
      .filter((v): v is string => !!v);
    const unique = Array.from(new Set(cvrs));
    const dupSet = new Set<string>();
    // Chunk i 500 ad gangen for at undgå URL-overflow
    for (let i = 0; i < unique.length; i += 500) {
      const slice = unique.slice(i, i + 500);
      const { data } = await supabase.from("companies").select("cvr").in("cvr", slice);
      (data ?? []).forEach((d) => dupSet.add(d.cvr));
    }
    setExistingCvrs(dupSet);
    setStep(3);
  }

  // Trin 4 → 5: hent lister og sælgere
  async function gotoAssignment() {
    const [{ data: lists }, { data: roles }] = await Promise.all([
      supabase.from("contact_lists").select("id,name").eq("is_active", true).order("name"),
      supabase.from("user_roles").select("user_id").eq("role", "saelger"),
    ]);
    setContactLists(lists ?? []);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    let sellersFlat: { id: string; full_name: string }[] = [];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .in("id", ids);
      sellersFlat = (profs ?? [])
        .filter((p: any) => p.is_active !== false)
        .map((p: any) => ({ id: p.id, full_name: p.full_name || "(uden navn)" }));
    }
    setSellers(sellersFlat);
    setStep(5);
  }

  const prepared = useMemo<PreparedRow[]>(() => {
    if (!mapping.cvr || !mapping.name) return [];
    return rows.map((r) => {
      const cvr = normCvr(r[mapping.cvr!]);
      const data: PreparedRow["data"] = {};
      for (const f of SYSTEM_FIELDS) {
        const src = mapping[f.key];
        if (!src) continue;
        const v = (r[src] ?? "").trim();
        if (!v) continue;
        if (f.key === "employees") {
          const n = parseInt(v.replace(/\D/g, ""), 10);
          data.employees = isNaN(n) ? null : n;
        } else {
          (data as any)[f.key] = v;
        }
      }
      const missingCvr = !cvr;
      const isDuplicate = !!cvr && existingCvrs.has(cvr);
      const hasError = !data.name;
      return {
        raw: r,
        cvr,
        data,
        isDuplicate,
        missingCvr,
        hasError,
        errorMessage: !data.name ? "Mangler navn" : undefined,
      };
    });
  }, [rows, mapping, existingCvrs]);

  const stats = useMemo(() => {
    const newCount = prepared.filter((p) => !p.isDuplicate && !p.missingCvr && !p.hasError).length;
    const dupCount = prepared.filter((p) => p.isDuplicate).length;
    const missingCount = prepared.filter((p) => p.missingCvr && !p.hasError).length;
    const errorCount = prepared.filter((p) => p.hasError).length;
    return { newCount, dupCount, missingCount, errorCount };
  }, [prepared]);

  // Trin 4: kør import (uden tildeling)
  async function runImport() {
    setImporting(true);
    setProgress(0);
    let created = 0, updated = 0, skipped = 0, failed = 0;
    const toImport = prepared.filter((p) => {
      if (p.hasError) return false;
      if (p.missingCvr && !includeMissingCvr) return false;
      return true;
    });
    const companyIds: string[] = [];

    for (let i = 0; i < toImport.length; i++) {
      const p = toImport[i];
      try {
        const payload: any = { ...stripUndef(p.data) };
        if (p.cvr) {
          const wasDup = p.isDuplicate;
          payload.cvr = p.cvr;
          const { data, error } = await supabase
            .from("companies")
            .upsert(payload, { onConflict: "cvr" })
            .select("id")
            .single();
          if (error) throw error;
          companyIds.push(data.id);
          if (wasDup) updated++; else created++;
        } else {
          payload.cvr = `NO-CVR-${Date.now()}-${i}`;
          payload.source = "csv_uden_cvr";
          const { data, error } = await supabase
            .from("companies")
            .insert(payload)
            .select("id")
            .single();
          if (error) throw error;
          companyIds.push(data.id);
          created++;
        }
      } catch (err: any) {
        failed++;
        console.error("Import-fejl række", i, err);
      }
      setProgress(Math.round(((i + 1) / toImport.length) * 100));
    }

    skipped = prepared.length - toImport.length - failed;

    setImportedIds(companyIds);
    setResult({ created, updated, skipped, failed });
    setImporting(false);
    toast.success("Import gennemført");
  }

  // Trin 5: tildel allerede importerede virksomheder
  async function runAssignment() {
    if (!chosenList || !chosenSeller) {
      toast.error("Vælg både kontaktliste og sælger");
      return;
    }
    if (!importedIds.length) {
      toast.error("Ingen virksomheder at tildele");
      return;
    }
    setAssigning(true);
    const assignments = importedIds.map((id) => ({
      company_id: id,
      contact_list_id: chosenList,
      assigned_to: chosenSeller,
    }));
    let failed = 0;
    for (let i = 0; i < assignments.length; i += 200) {
      const { error } = await supabase
        .from("contact_list_assignments")
        .insert(assignments.slice(i, i + 200));
      if (error) failed++;
    }
    setAssigning(false);
    if (failed) {
      toast.error("Nogle tildelinger fejlede");
    } else {
      toast.success(`${importedIds.length} virksomheder tildelt`);
    }
    navigate({ to: "/virksomheder" });
  }

  function goLater() {
    if (importedIds.length) {
      try {
        sessionStorage.setItem(
          "recently_imported_ids",
          JSON.stringify({ ids: importedIds, at: Date.now() }),
        );
      } catch {}
    }
    navigate({ to: "/virksomheder" });
  }

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-8 max-w-5xl mx-auto pb-24 md:pb-8">
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">Import af virksomheder</h1>
      <p className="text-sm text-muted-foreground mb-6">CSV-import i 4 trin (+ valgfri tildeling)</p>

      <Stepper step={step} />

      {step === 1 && <Trin1Upload onFile={handleFile} />}
      {step === 2 && (
        <Trin2Mapping
          headers={headers}
          mapping={mapping}
          setMapping={setMapping}
          onBack={() => setStep(1)}
          onNext={gotoPreview}
        />
      )}
      {step === 3 && (
        <Trin3Preview
          prepared={prepared}
          stats={stats}
          includeMissingCvr={includeMissingCvr}
          setIncludeMissingCvr={setIncludeMissingCvr}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <Trin4Import
          stats={stats}
          includeMissingCvr={includeMissingCvr}
          importing={importing}
          progress={progress}
          result={result}
          importedCount={importedIds.length}
          onBack={() => setStep(3)}
          onRun={runImport}
          onAssignNow={gotoAssignment}
          onLater={goLater}
        />
      )}
      {step === 5 && (
        <Trin5Tildeling
          contactLists={contactLists}
          sellers={sellers}
          chosenList={chosenList}
          chosenSeller={chosenSeller}
          setChosenList={setChosenList}
          setChosenSeller={setChosenSeller}
          importedCount={importedIds.length}
          assigning={assigning}
          onBack={() => setStep(4)}
          onAssign={runAssignment}
          onSkip={goLater}
        />
      )}
    </div>
  );
}

function stripUndef<T extends object>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== "" && v !== null) out[k] = v;
  }
  return out;
}

function normCvr(v: string | undefined | null): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(0, 8) : null;
}

function Stepper({ step }: { step: number }) {
  const steps = ["Upload", "Kolonnematch", "Preview", "Importér", "Tildeling (valgfri)"];
  return (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-4 w-4" /> : n}
            </div>
            <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
            {n < steps.length && <div className="w-6 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  );
}

function Trin1Upload({ onFile }: { onFile: (f: File) => void }) {
  return (
    <Card className="p-8">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <FileUp className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="font-semibold mb-1">Upload CSV-fil</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Filen skal have en kolonne med CVR-nummer og en med virksomhedsnavn.
        </p>
        <div className="max-w-sm mx-auto">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function Trin2Mapping({
  headers,
  mapping,
  setMapping,
  onBack,
  onNext,
}: {
  headers: string[];
  mapping: Partial<Record<SystemField, string>>;
  setMapping: (m: Partial<Record<SystemField, string>>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1">Match kolonner</h2>
      <p className="text-sm text-muted-foreground mb-5">
        Vælg hvilken CSV-kolonne der svarer til hvert systemfelt. CVR og Navn er påkrævet.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SYSTEM_FIELDS.map((f) => (
          <div key={f.key}>
            <Label className="mb-1.5 block">
              {f.label} {f.required && <span className="text-destructive">*</span>}
            </Label>
            <Select
              value={mapping[f.key] ?? "__none"}
              onValueChange={(v) =>
                setMapping({ ...mapping, [f.key]: v === "__none" ? undefined : v })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Vælg kolonne" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— Ingen —</SelectItem>
                {headers.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <Button onClick={onNext}>
          Forhåndsvis <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </Card>
  );
}

function Trin3Preview({
  prepared,
  stats,
  includeMissingCvr,
  setIncludeMissingCvr,
  onBack,
  onNext,
}: {
  prepared: PreparedRow[];
  stats: { newCount: number; dupCount: number; missingCount: number; errorCount: number };
  includeMissingCvr: boolean;
  setIncludeMissingCvr: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const sample = prepared.slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Nye virksomheder" value={stats.newCount} tone="success" />
        <StatCard label="CVR-dubletter (opdateres)" value={stats.dupCount} tone="warning" />
        <StatCard label="Mangler CVR" value={stats.missingCount} tone="muted" />
        <StatCard label="Fejl" value={stats.errorCount} tone="destructive" />
      </div>

      {stats.missingCount > 0 && (
        <Card className="p-4 border-warning/30 bg-warning/5 flex gap-3 items-start">
          <AlertTriangle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium mb-1">
              {stats.missingCount} rækker har intet CVR
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Vælg om de skal importeres alligevel eller springes over.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeMissingCvr}
                onCheckedChange={(v) => setIncludeMissingCvr(v === true)}
              />
              Importér også rækker uden CVR
            </label>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Status</TableHead>
              <TableHead>CVR</TableHead>
              <TableHead>Navn</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sample.map((p, i) => (
              <TableRow key={i}>
                <TableCell>
                  {p.hasError ? (
                    <Badge variant="destructive">Fejl</Badge>
                  ) : p.missingCvr ? (
                    <Badge variant="outline">Uden CVR</Badge>
                  ) : p.isDuplicate ? (
                    <Badge variant="secondary">Opdater</Badge>
                  ) : (
                    <Badge>Ny</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{p.cvr ?? "—"}</TableCell>
                <TableCell>{(p.data.name as string) ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{(p.data.city as string) ?? ""}</TableCell>
                <TableCell className="text-muted-foreground">{(p.data.phone as string) ?? ""}</TableCell>
                <TableCell className="text-muted-foreground">{(p.data.email as string) ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground">
        Viser de første 10 af {prepared.length} rækker.
      </p>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <Button onClick={onNext}>
          Fortsæt <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

function Trin4Import({
  stats,
  includeMissingCvr,
  importing,
  progress,
  result,
  importedCount,
  onBack,
  onRun,
  onAssignNow,
  onLater,
}: {
  stats: { newCount: number; dupCount: number; missingCount: number; errorCount: number };
  includeMissingCvr: boolean;
  importing: boolean;
  progress: number;
  result: { created: number; updated: number; skipped: number; failed: number } | null;
  importedCount: number;
  onBack: () => void;
  onRun: () => void;
  onAssignNow: () => void;
  onLater: () => void;
}) {
  if (result) {
    return (
      <Card className="p-6 text-center">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto mb-3" />
        <h2 className="font-semibold mb-2">Import gennemført</h2>
        <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto">
          {importedCount} virksomheder importeret. Vil du tildele dem til en kontaktliste og sælger nu, eller gøre det senere?
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-md mx-auto mb-6">
          <StatCard label="Oprettet" value={result.created} tone="success" />
          <StatCard label="Opdateret" value={result.updated} tone="warning" />
          <StatCard label="Sprunget over" value={result.skipped} tone="muted" />
          <StatCard label="Fejl" value={result.failed} tone="destructive" />
        </div>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button variant="outline" onClick={onLater}>Gør det senere</Button>
          <Button onClick={onAssignNow} disabled={importedCount === 0}>
            Tildel nu <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </Card>
    );
  }

  const willImport =
    stats.newCount + stats.dupCount + (includeMissingCvr ? stats.missingCount : 0);
  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1">Bekræft og importér</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {willImport} rækker importeres. {stats.dupCount} eksisterende opdateres, {stats.newCount} nye oprettes.
        {!includeMissingCvr && stats.missingCount > 0 && (
          <> {stats.missingCount} rækker uden CVR springes over.</>
        )}
        {stats.errorCount > 0 && <> {stats.errorCount} rækker med fejl springes over.</>}
      </p>

      {importing && (
        <div className="mb-4">
          <Progress value={progress} className="mb-2" />
          <p className="text-xs text-muted-foreground text-center">Importerer… {progress}%</p>
        </div>
      )}

      <div className="flex justify-between mt-4">
        <Button variant="outline" onClick={onBack} disabled={importing}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <Button onClick={onRun} disabled={importing || willImport === 0}>
          {importing ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importerer…</>
          ) : (
            <><Upload className="h-4 w-4 mr-2" /> Start import</>
          )}
        </Button>
      </div>
    </Card>
  );
}

function Trin5Tildeling({
  contactLists,
  sellers,
  chosenList,
  chosenSeller,
  setChosenList,
  setChosenSeller,
  importedCount,
  assigning,
  onBack,
  onAssign,
  onSkip,
}: {
  contactLists: { id: string; name: string }[];
  sellers: { id: string; full_name: string }[];
  chosenList: string;
  chosenSeller: string;
  setChosenList: (v: string) => void;
  setChosenSeller: (v: string) => void;
  importedCount: number;
  assigning: boolean;
  onBack: () => void;
  onAssign: () => void;
  onSkip: () => void;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-semibold mb-1">Tildel til kontaktliste og sælger</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {importedCount} importerede virksomheder tildeles den valgte kontaktliste og sælger.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <Label className="mb-1.5 block">Kontaktliste</Label>
          <Select value={chosenList} onValueChange={setChosenList}>
            <SelectTrigger><SelectValue placeholder="Vælg liste" /></SelectTrigger>
            <SelectContent>
              {contactLists.length === 0 ? (
                <SelectItem value="__none" disabled>Ingen aktive lister</SelectItem>
              ) : (
                contactLists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block">Sælger</Label>
          <Select value={chosenSeller} onValueChange={setChosenSeller}>
            <SelectTrigger><SelectValue placeholder="Vælg sælger" /></SelectTrigger>
            <SelectContent>
              {sellers.length === 0 ? (
                <SelectItem value="__none" disabled>Ingen sælgere fundet</SelectItem>
              ) : (
                sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={assigning}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onSkip} disabled={assigning}>
            Spring over
          </Button>
          <Button onClick={onAssign} disabled={assigning || !chosenList || !chosenSeller}>
            {assigning ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Tildeler…</>
            ) : (
              <>Tildel <ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "destructive" | "muted";
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    muted: "text-muted-foreground",
  }[tone];
  return (
    <Card className="p-4">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}
