import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { readFileSmart } from "@/lib/file-encoding";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  listAgreements,
  previewAgreementProspects,
  importAgreementProspects,
} from "@/lib/agreements.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileUp,
  Loader2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import/aftale-emner")({
  component: AftaleEmnerImportSide,
});

type Row = { cvr: string; name?: string };

function normCvr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = String(v).replace(/\D/g, "");
  return d.length >= 8 ? d.slice(0, 8) : null;
}

function AftaleEmnerImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const fetchAgreements = useServerFn(listAgreements);
  const preview = useServerFn(previewAgreementProspects);
  const runImport = useServerFn(importAgreementProspects);

  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [agreementId, setAgreementId] = useState<string>("");
  const [listName, setListName] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    total: number;
    existing: string[];
    missing: string[];
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    list_id: string;
    total: number;
    created: number;
    matched: number;
    assigned: number;
  } | null>(null);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  const { data: agreements } = useQuery({
    queryKey: ["agreements", "for-import"],
    queryFn: () => fetchAgreements(),
  });

  const chosenAgreement = useMemo(
    () => (agreements ?? []).find((a: any) => a.id === agreementId),
    [agreements, agreementId],
  );

  // Auto-foreslå listenavn når aftale vælges
  useEffect(() => {
    if (chosenAgreement && !listName) {
      setListName(`Ny aftale - ${chosenAgreement.name}`);
    }
  }, [chosenAgreement, listName]);

  async function handleFile(f: File) {
    setFile(f);
    const ext = f.name.split(".").pop()?.toLowerCase();
    try {
      let parsed: Record<string, any>[] = [];
      if (ext === "xlsx" || ext === "xls") {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
      } else {
        const text = await readFileSmart(f);
        const firstLine = text.split("\n")[0] ?? "";
        const delimiter =
          firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
        const res = Papa.parse<Record<string, string>>(text, {
          delimiter,
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
        });
        parsed = res.data;
      }

      // Find cvr- og navn-kolonne
      const headers = Object.keys(parsed[0] ?? {});
      const cvrKey = headers.find((h) =>
        /^(cvr|cvrnr|cvr_nr|cvr_nummer|cvr nummer)$/i.test(h.trim()),
      );
      const nameKey = headers.find((h) =>
        /^(navn|name|firmanavn|virksomhed|selskab)$/i.test(h.trim()),
      );
      if (!cvrKey) {
        toast.error("Filen skal have en kolonne 'CVR'");
        setFile(null);
        return;
      }

      const seen = new Set<string>();
      const valid: Row[] = [];
      let invalidCount = 0;
      for (const r of parsed) {
        const c = normCvr(r[cvrKey]);
        if (!c) {
          invalidCount++;
          continue;
        }
        if (seen.has(c)) continue;
        seen.add(c);
        valid.push({
          cvr: c,
          name: nameKey ? String(r[nameKey] ?? "").trim() || undefined : undefined,
        });
      }
      if (!valid.length) {
        toast.error("Ingen gyldige CVR-numre fundet i filen");
        setFile(null);
        return;
      }
      setRows(valid);
      toast.success(
        `${valid.length} unikke CVR fundet${invalidCount ? ` (${invalidCount} ugyldige sprunget over)` : ""}`,
      );
      setStep(2);
    } catch (e: any) {
      toast.error("Kunne ikke læse filen: " + (e?.message || "ukendt fejl"));
    }
  }

  async function gotoPreview() {
    if (!agreementId) {
      toast.error("Vælg en aftale");
      return;
    }
    if (!listName.trim()) {
      toast.error("Angiv et navn til kontaktlisten");
      return;
    }
    setPreviewing(true);
    try {
      const res = await preview({ data: { cvrs: rows.map((r) => r.cvr) } });
      setPreviewData(res);
      setStep(3);
    } catch (e: any) {
      toast.error("Preview fejlede: " + (e?.message || "ukendt fejl"));
    } finally {
      setPreviewing(false);
    }
  }

  async function runFullImport() {
    setImporting(true);
    try {
      const res = await runImport({
        data: {
          agreement_id: agreementId,
          list_name: listName.trim(),
          rows,
        },
      });
      setResult(res);
      toast.success(
        `${res.assigned} virksomheder tildelt listen (${res.created} nye oprettet)`,
      );
      setStep(4);
    } catch (e: any) {
      toast.error("Import fejlede: " + (e?.message || "ukendt fejl"));
    } finally {
      setImporting(false);
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
    <div className="px-4 md:px-8 py-8 max-w-4xl mx-auto pb-24 md:pb-8">
      <Link
        to="/admin/import"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Vælg anden importtype
      </Link>
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">
        Importér aftale-emner
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Upload en CVR-liste fra en aftalepartner (fx Dansk Erhverv).
        Eksisterende virksomheder matches på CVR, nye oprettes automatisk og
        tilknyttes en ny kontaktliste.
      </p>

      <Stepper step={step} />

      {step === 1 && (
        <Card className="p-8">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileUp className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="font-semibold mb-1">Upload CVR-liste</h2>
            <p className="text-sm text-muted-foreground mb-4">
              CSV eller Excel (.xlsx). Skal indeholde en kolonne kaldet
              <strong> CVR</strong>. Kolonnen <strong>Navn</strong> bruges hvis
              tilgængelig.
            </p>
            <div className="max-w-sm mx-auto">
              <Input
                type="file"
                accept=".csv,.xlsx,.xls,.txt,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="font-semibold mb-1">Vælg aftale og navngiv liste</h2>
            <p className="text-sm text-muted-foreground">
              {file?.name} · {rows.length} CVR-numre
            </p>
          </div>

          <div>
            <Label className="mb-1.5 block">Aftale *</Label>
            <Select value={agreementId} onValueChange={setAgreementId}>
              <SelectTrigger>
                <SelectValue placeholder="Vælg eksisterende aftale" />
              </SelectTrigger>
              <SelectContent>
                {(agreements ?? []).length === 0 ? (
                  <SelectItem value="__none" disabled>
                    Ingen aftaler oprettet endnu
                  </SelectItem>
                ) : (
                  (agreements ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.kp1_code ? ` (KP1: ${a.kp1_code})` : ""}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {chosenAgreement?.is_public_sector && (
              <p className="text-xs text-warning mt-2">
                ⚠️ Offentlig aftale — nye virksomheder markeres som offentlige.
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1.5 block">Navn på kontaktliste *</Label>
            <Input
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              placeholder="Fx Ny aftale - Dansk Erhverv"
            />
          </div>

          <div className="flex justify-between pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep(1);
                setFile(null);
                setRows([]);
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
            </Button>
            <Button onClick={gotoPreview} disabled={previewing || !agreementId}>
              {previewing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyserer…
                </>
              ) : (
                <>
                  Vis preview <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && previewData && (
        <Card className="p-6 space-y-5">
          <div>
            <h2 className="font-semibold mb-1">Klar til import</h2>
            <p className="text-sm text-muted-foreground">
              Aftale: <strong>{chosenAgreement?.name}</strong> · Liste:{" "}
              <strong>{listName}</strong>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="I alt" value={previewData.total} tone="muted" />
            <StatCard
              label="Eksisterende (matches)"
              value={previewData.existing.length}
              tone="success"
            />
            <StatCard
              label="Nye (oprettes)"
              value={previewData.missing.length}
              tone="warning"
            />
          </div>

          <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1">
            <p>Ved import:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>
                {previewData.existing.length} eksisterende virksomheder bliver
                tildelt listen
              </li>
              <li>
                {previewData.missing.length} nye virksomheder oprettes med KP1
                = <Badge variant="outline">{chosenAgreement?.kp1_code || "(ingen)"}</Badge>
              </li>
              <li>Kontaktliste &quot;{listName}&quot; oprettes</li>
            </ul>
          </div>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep(2)} disabled={importing}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Tilbage
            </Button>
            <Button onClick={runFullImport} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importerer…
                </>
              ) : (
                <>
                  Start import <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && result && (
        <Card className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold">Import gennemført</h2>
              <p className="text-sm text-muted-foreground">
                Kontaktlisten &quot;{listName}&quot; er oprettet og {result.assigned}{" "}
                virksomheder er tildelt.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Tildelt liste" value={result.assigned} tone="success" />
            <StatCard label="Matchede" value={result.matched} tone="muted" />
            <StatCard label="Nye oprettet" value={result.created} tone="warning" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => navigate({ to: "/kontaktlister" })}
            >
              <Users className="h-4 w-4 mr-2" /> Se kontaktlister
            </Button>
            <Button
              onClick={() =>
                navigate({
                  to: "/kontaktlister/$id",
                  params: { id: result.list_id },
                })
              }
            >
              Åbn ny liste <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Upload", "Vælg aftale", "Preview", "Færdig"];
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
                  ? "bg-success text-success-foreground"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? "✓" : n}
            </div>
            <span
              className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}
            >
              {label}
            </span>
            {n < steps.length && <span className="text-muted-foreground">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "muted";
}) {
  const toneClass = {
    success: "text-success",
    warning: "text-warning",
    muted: "text-foreground",
  }[tone];
  return (
    <Card className="p-4">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}
