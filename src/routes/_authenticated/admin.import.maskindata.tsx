import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { useAuth } from "@/hooks/useAuth";
import { useServerFn } from "@tanstack/react-start";
import { processEquipmentImport, resetEquipmentData } from "@/lib/equipment-import.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileUp, Loader2, Wrench, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/admin/import/maskindata")({
  component: MaskindataImportSide,
});

type RentalRow = {
  fak: string;
  lev: string;
  beskrivelse: string;
  udlanstype: string;
  varenr: string;
  serienr: string;
  adresselinje2: string;
};
type ServiceRow = {
  fak: string;
  lev: string;
  maskintype: string;
  serienr: string;
  aftaletype: string;
  status: string;
  placering: string;
};

function readXlsx(file: File): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", raw: false });
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

function parseRentalRows(rows: Record<string, any>[]): RentalRow[] {
  return rows
    .map((r) => ({
      fak: String(r["Fak. kundenr"] ?? "").trim(),
      lev: String(r["Lev kundenr"] ?? "").trim(),
      beskrivelse: String(r["Beskrivelse"] ?? "").trim(),
      udlanstype: String(r["Udlånstype (Transgr2)"] ?? "").trim(),
      varenr: String(r["Vare nr"] ?? "").trim(),
      serienr: String(r["SerienrWit"] ?? "").trim(),
      adresselinje2: String(r["Adresselinje 2"] ?? "").trim(),
    }))
    .filter((r) => r.lev);
}

function parseServiceRows(rows: Record<string, any>[]): ServiceRow[] {
  return rows
    .map((r) => ({
      fak: String(r["Faktureres kundenr."] ?? "").trim(),
      lev: String(r["Lev. kundenr"] ?? "").trim(),
      maskintype: String(r["Maskin type (G2)"] ?? "").trim(),
      serienr: String(r["Serie.nr."] ?? "").trim(),
      aftaletype: String(r["Aftale Type (G4)"] ?? "").trim(),
      status: String(r["Status"] ?? "").trim(),
      placering: String(r["Placering"] ?? "").trim(),
    }))
    .filter((r) => r.lev);
}

function MaskindataImportSide() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [rentalRows, setRentalRows] = useState<RentalRow[]>([]);
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<{ updated: number; fallbackUpdated: number; created: number; unmatched: number } | null>(null);
  const processFn = useServerFn(processEquipmentImport);
  const resetFn = useServerFn(resetEquipmentData);

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  async function handleA(f: File) {
    setFileA(f);
    try {
      const raw = await readXlsx(f);
      const parsed = parseRentalRows(raw);
      setRentalRows(parsed);
      toast.success(`Fil A: ${parsed.length} rækker indlæst`);
    } catch (e: any) {
      toast.error("Kunne ikke læse fil A: " + (e?.message ?? "ukendt fejl"));
    }
  }

  async function handleB(f: File) {
    setFileB(f);
    try {
      const raw = await readXlsx(f);
      const parsed = parseServiceRows(raw);
      setServiceRows(parsed);
      toast.success(`Fil B: ${parsed.length} rækker indlæst`);
    } catch (e: any) {
      toast.error("Kunne ikke læse fil B: " + (e?.message ?? "ukendt fejl"));
    }
  }

  async function runImport() {
    if (rentalRows.length === 0 && serviceRows.length === 0) {
      toast.error("Upload mindst én fil før import");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await processFn({ data: { rentalRows, serviceRows } });
      setResult(res);
      toast.success("Maskindata-import gennemført");
    } catch (e: any) {
      toast.error("Fejl under import: " + (e?.message ?? "ukendt fejl"));
    } finally {
      setBusy(false);
    }
  }

  async function runReset() {
    setResetting(true);
    try {
      const res = await resetFn();
      toast.success(`Nulstillede maskindata på ${res.reset} lokationer`);
      setResult(null);
    } catch (e: any) {
      toast.error("Fejl under nulstilling: " + (e?.message ?? "ukendt fejl"));
    } finally {
      setResetting(false);
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
    <div className="px-4 md:px-8 py-8 max-w-3xl mx-auto pb-24 md:pb-8">
      <Link to="/admin/import" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-4 w-4" /> Tilbage til importvalg
      </Link>
      <h1 className="text-2xl md:text-3xl font-semibold mb-2 flex items-center gap-2">
        <Wrench className="h-6 w-6" /> Maskindata (Visma)
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Opdatér udstyrsoverblik på lokationer fra rå Visma-udtræk. Upload én eller begge filer.
      </p>

      <Card className="p-6 space-y-6">
        <div>
          <Label className="mb-2 block font-medium">Leje og udlån af maskiner</Label>
          <p className="text-xs text-muted-foreground mb-2">XLSX-fil direkte fra Visma — rå, ubehandlet</p>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && handleA(e.target.files[0])}
            disabled={busy}
          />
          {fileA && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <FileUp className="h-3.5 w-3.5" /> {fileA.name} — {rentalRows.length} brugbare rækker
            </p>
          )}
        </div>

        <div>
          <Label className="mb-2 block font-medium">Maskiner med service, som ikke lejes eller udlånes</Label>
          <p className="text-xs text-muted-foreground mb-2">XLSX-fil direkte fra Visma — rå, ubehandlet</p>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => e.target.files?.[0] && handleB(e.target.files[0])}
            disabled={busy}
          />
          {fileB && (
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <FileUp className="h-3.5 w-3.5" /> {fileB.name} — {serviceRows.length} brugbare rækker
            </p>
          )}
        </div>

        <div className="pt-4 border-t flex items-center gap-3">
          <Button onClick={runImport} disabled={busy || (rentalRows.length === 0 && serviceRows.length === 0)}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Wrench className="h-4 w-4 mr-2" />}
            {busy ? "Importerer…" : "Importér maskindata"}
          </Button>
          {(rentalRows.length > 0 || serviceRows.length > 0) && !busy && !result && (
            <span className="text-xs text-muted-foreground">
              {rentalRows.length} leje/udlån + {serviceRows.length} service-rækker behandles
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
            <li><strong>{result.updated}</strong> lokationer opdateret (exact match)</li>
            <li><strong>{result.fallbackUpdated}</strong> lokationer opdateret (fallback match)</li>
            <li><strong>{result.created}</strong> nye lokationer oprettet</li>
            <li><strong>{result.unmatched}</strong> rækker kunne ikke matches (ingen lokation/virksomhed fundet)</li>
          </ul>
        </Card>
      )}

      <Card className="p-6 mt-4 border-destructive/30">
        <h2 className="font-semibold mb-1 text-destructive flex items-center gap-2">
          <RotateCcw className="h-4 w-4" /> Nulstil maskindata
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Sletter alle udstyrsfelter (antal, aftaler, salgssignal) på samtlige lokationer, så du kan
          importere rent forfra. Selve lokationerne og deres adresser bevares.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={busy || resetting}>
              {resetting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              {resetting ? "Nulstiller…" : "Nulstil maskindata"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Nulstil alle maskindata?</AlertDialogTitle>
              <AlertDialogDescription>
                Alle equipment-felter på alle lokationer sættes til 0/null. Handlingen kan ikke fortrydes
                — men du kan altid køre maskindata-importen igen bagefter.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annullér</AlertDialogCancel>
              <AlertDialogAction onClick={runReset}>Ja, nulstil</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </div>
  );
}
