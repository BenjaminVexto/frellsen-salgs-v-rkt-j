import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { cvrLookup } from "@/lib/cvr-lookup.functions";
import { importCompaniesFromCvr } from "@/lib/cvr-import.functions";
import { supabase } from "@/integrations/supabase/client";
import { KOMMUNE_KODER } from "@/lib/cvr-kommuner";

const BRANCH_CATEGORIES: { label: string; prefixes: string[] }[] = [
  { label: "Kontor og administration", prefixes: ["64","65","66","69","70","71","72","73","74","77","78"] },
  { label: "Produktion og industri", prefixes: ["10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25","26","27","28","29","30","31","32","33"] },
  { label: "Uddannelse", prefixes: ["85"] },
  { label: "Sundhed og pleje", prefixes: ["86","87","88"] },
  { label: "Hotel og restauration", prefixes: ["55","56"] },
  { label: "Offentlig forvaltning", prefixes: ["84"] },
  { label: "Handel og detail", prefixes: ["45","46","47"] },
  { label: "IT og medier", prefixes: ["58","59","60","61","62","63"] },
  { label: "Foreninger og organisationer", prefixes: ["90","91","92","93","94","95","96"] },
];

const EMPLOYEE_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "1-4", min: 1, max: 4 },
  { label: "5-9", min: 5, max: 9 },
  { label: "10-19", min: 10, max: 19 },
  { label: "20-49", min: 20, max: 49 },
  { label: "50-99", min: 50, max: 99 },
  { label: "100-199", min: 100, max: 199 },
  { label: "200+", min: 200, max: 100000 },
];

const COMPANY_FORMS = ["A/S","ApS","I/S","Enkeltmandsfirma","Forening","Kommune/Region/Stat","Øvrige"];

type CvrRow = {
  cvr: string;
  name: string | null;
  city: string | null;
  municipality: string | null;
  industry: string | null;
  employees: string | null;
  ad_protection: boolean;
  company_form: string | null;
  existing: boolean;
};

export function CvrBulkSoegningDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: (companyIds: string[]) => void;
}) {
  const lookupFn = useServerFn(cvrLookup);
  const importFn = useServerFn(importCompaniesFromCvr);

  const kommuneOptions = useMemo(
    () => Array.from(new Set(Object.keys(KOMMUNE_KODER))).sort(),
    [],
  );

  const [kommuner, setKommuner] = useState<string[]>([]);
  const [zipFrom, setZipFrom] = useState("");
  const [zipTo, setZipTo] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [employeeBuckets, setEmployeeBuckets] = useState<string[]>([]);
  const [companyForms, setCompanyForms] = useState<string[]>([]);
  const [activeOnly, setActiveOnly] = useState(true);

  const [rows, setRows] = useState<CvrRow[]>([]);
  const [selectedCvrs, setSelectedCvrs] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const toggleSet = (set: string[], val: string, setter: (v: string[]) => void) => {
    setter(set.includes(val) ? set.filter((v) => v !== val) : [...set, val]);
  };

  async function runSearch() {
    if (!kommuner.length && !(zipFrom && zipTo)) {
      toast.error("Vælg mindst én kommune eller indtast postnummer-interval");
      return;
    }
    setSearching(true);
    setHasSearched(true);
    setRows([]);
    setSelectedCvrs(new Set());

    const branchCodes: string[] = [];
    for (const cat of BRANCH_CATEGORIES) {
      if (categories.includes(cat.label)) branchCodes.push(...cat.prefixes);
    }

    // Beregn ansatte-interval
    let minEmp: number | undefined;
    let maxEmp: number | undefined;
    if (employeeBuckets.length) {
      const buckets = EMPLOYEE_BUCKETS.filter((b) => employeeBuckets.includes(b.label));
      minEmp = Math.min(...buckets.map((b) => b.min));
      maxEmp = Math.max(...buckets.map((b) => b.max));
    }

    // Søg pr. kommune (CVR ES bruger kommunekode-felt). Postnummer-interval ignoreres af ES — vi filtrerer i koden.
    const targetKommuner = kommuner.length ? kommuner : [null];
    const aggregated = new Map<string, CvrRow>();

    try {
      for (const k of targetKommuner) {
        const res = await lookupFn({
          data: {
            type: "bulk",
            filters: {
              ...(k ? { municipality: k } : {}),
              branch_codes: branchCodes.length ? branchCodes : undefined,
              min_employees: minEmp,
              max_employees: maxEmp,
              company_forms: companyForms.length ? companyForms : undefined,
              status: activeOnly ? "AKTIV" : undefined,
            } as any,
            size: 500,
          } as any,
        });
        if (!res.success) {
          toast.error("CVR-søgning fejlede: " + (res.error ?? "ukendt"));
          continue;
        }
        const list = Array.isArray(res.data) ? res.data : [];
        for (const c of list) {
          // Postnummer-filter (klient-side)
          if (zipFrom && zipTo && c.zip) {
            const z = parseInt(c.zip, 10);
            const from = parseInt(zipFrom, 10);
            const to = parseInt(zipTo, 10);
            if (!isNaN(z) && !isNaN(from) && !isNaN(to) && (z < from || z > to)) continue;
          }
          if (!aggregated.has(c.cvr)) {
            aggregated.set(c.cvr, {
              cvr: c.cvr,
              name: c.name,
              city: c.city,
              municipality: c.municipality,
              industry: c.main_branch_text,
              employees: c.employees_interval,
              ad_protection: !!c.ad_protection,
              company_form: c.company_form,
              existing: false,
            });
          }
        }
      }

      // Tjek hvilke der findes i systemet
      const cvrs = Array.from(aggregated.keys());
      if (cvrs.length) {
        const existingSet = new Set<string>();
        for (let i = 0; i < cvrs.length; i += 500) {
          const slice = cvrs.slice(i, i + 500);
          const { data } = await supabase.from("companies").select("cvr").in("cvr", slice);
          (data ?? []).forEach((r) => r.cvr && existingSet.add(r.cvr));
        }
        for (const c of aggregated.values()) c.existing = existingSet.has(c.cvr);
      }

      const all = Array.from(aggregated.values());
      setRows(all);
      // Vælg alle nye automatisk
      setSelectedCvrs(new Set(all.filter((r) => !r.existing).map((r) => r.cvr)));
    } finally {
      setSearching(false);
    }
  }

  function selectAllNew() {
    setSelectedCvrs(new Set(rows.filter((r) => !r.existing).map((r) => r.cvr)));
  }
  function clearSelection() {
    setSelectedCvrs(new Set());
  }
  function toggleRow(cvr: string) {
    setSelectedCvrs((prev) => {
      const next = new Set(prev);
      if (next.has(cvr)) next.delete(cvr); else next.add(cvr);
      return next;
    });
  }

  async function doImport() {
    const chosen = rows.filter((r) => selectedCvrs.has(r.cvr));
    if (!chosen.length) {
      toast.error("Vælg mindst én virksomhed");
      return;
    }
    setImporting(true);
    try {
      const payload = chosen
        .filter((r) => r.name)
        .map((r) => ({
          cvr: r.cvr,
          name: r.name!,
          city: r.city,
          municipality: r.municipality,
          industry: r.industry,
          employees_interval: r.employees,
          company_form: r.company_form,
        }));
      const res = await importFn({ data: { companies: payload } });
      toast.success(
        `Importeret: ${res.inserted} nye, ${res.already_existed} fandtes allerede`,
      );
      onImported(res.company_ids);
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Import fejlede: " + (e?.message ?? "ukendt fejl"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Søg nye emner i CVR-registret</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Sektion A: Filtre */}
          <div className="space-y-5">
            <div>
              <Label className="text-sm font-semibold">Geografi *</Label>
              <p className="text-xs text-muted-foreground mb-2">Vælg mindst én kommune ELLER postnummer-interval</p>
              <div className="border rounded-md max-h-44 overflow-y-auto p-2 bg-background">
                <div className="grid grid-cols-2 gap-1">
                  {kommuneOptions.map((k) => (
                    <label key={k} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={kommuner.includes(k)}
                        onCheckedChange={() => toggleSet(kommuner, k, setKommuner)}
                      />
                      {k}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Input placeholder="Postnr. fra" value={zipFrom} onChange={(e) => setZipFrom(e.target.value)} />
                <Input placeholder="Postnr. til" value={zipTo} onChange={(e) => setZipTo(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Branchekategori</Label>
              <div className="grid grid-cols-1 gap-1 mt-1">
                {BRANCH_CATEGORIES.map((cat) => (
                  <label key={cat.label} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={categories.includes(cat.label)}
                      onCheckedChange={() => toggleSet(categories, cat.label, setCategories)}
                    />
                    {cat.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Antal ansatte</Label>
              <div className="flex flex-wrap gap-3 mt-1">
                {EMPLOYEE_BUCKETS.map((b) => (
                  <label key={b.label} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={employeeBuckets.includes(b.label)}
                      onCheckedChange={() => toggleSet(employeeBuckets, b.label, setEmployeeBuckets)}
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Virksomhedsform</Label>
              <div className="flex flex-wrap gap-3 mt-1">
                {COMPANY_FORMS.map((f) => (
                  <label key={f} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={companyForms.includes(f)}
                      onCheckedChange={() => toggleSet(companyForms, f, setCompanyForms)}
                    />
                    {f}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <Label className="text-sm">Kun aktive virksomheder</Label>
              <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
            </div>

            <Button onClick={runSearch} disabled={searching} className="w-full">
              {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Søg i CVR-registret
            </Button>
          </div>

          {/* Sektion B: Resultater */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                {hasSearched ? (
                  <span>
                    <strong>{rows.length}</strong> virksomheder fundet i CVR
                    {rows.length > 0 && ` · ${selectedCvrs.size} valgt`}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Konfigurér filtre og søg</span>
                )}
              </div>
              {rows.length > 0 && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={selectAllNew}>Vælg alle nye</Button>
                  <Button size="sm" variant="ghost" onClick={clearSelection}>Ryd</Button>
                </div>
              )}
            </div>

            <div className="border rounded-md max-h-[480px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Navn</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Branche</TableHead>
                    <TableHead>Ansatte</TableHead>
                    <TableHead>I systemet?</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        {searching ? "Søger…" : hasSearched ? "Ingen resultater" : "—"}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.cvr}>
                      <TableCell>
                        <Checkbox
                          checked={selectedCvrs.has(r.cvr)}
                          onCheckedChange={() => toggleRow(r.cvr)}
                        />
                      </TableCell>
                      <TableCell className="text-sm">{r.name ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.city ?? "—"}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{r.industry ?? "—"}</TableCell>
                      <TableCell className="text-xs">{r.employees ?? "—"}</TableCell>
                      <TableCell>
                        {r.existing ? (
                          <Badge variant="secondary" className="text-xs">Ja</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Nej</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.ad_protection && (
                          <span title="Reklamebeskyttelse">
                            <ShieldAlert className="h-4 w-4 text-warning" />
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Annullér</Button>
          <Button onClick={doImport} disabled={importing || !selectedCvrs.size}>
            {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Importér {selectedCvrs.size} valgte til systemet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
