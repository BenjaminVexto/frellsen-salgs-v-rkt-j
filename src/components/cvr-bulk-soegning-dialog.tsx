import { useState } from "react";
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
import { Progress } from "@/components/ui/progress";
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
  { label: "0", min: 0, max: 0 },
  { label: "1", min: 1, max: 1 },
  { label: "2-4", min: 2, max: 4 },
  { label: "5-9", min: 5, max: 9 },
  { label: "10-19", min: 10, max: 19 },
  { label: "20-49", min: 20, max: 49 },
  { label: "50-99", min: 50, max: 99 },
  { label: "100-199", min: 100, max: 199 },
  { label: "200-499", min: 200, max: 499 },
  { label: "500-999", min: 500, max: 999 },
  { label: "1000+", min: 1000, max: 999999 },
];

const COMPANY_FORMS: { label: string; value: string }[] = [
  { label: "A/S", value: "Aktieselskab" },
  { label: "ApS", value: "Anpartsselskab" },
  { label: "I/S", value: "Interessentskab" },
  { label: "K/S", value: "Kommanditselskab" },
  { label: "Enkeltmandsfirma", value: "Enkeltmandsvirksomhed" },
  { label: "Forening", value: "Forening" },
  { label: "Kommune/Region/Stat", value: "Kommune" },
  { label: "Øvrige", value: "Øvrige" },
];

const KOMMUNER = [
  "Aabenraa","Aalborg","Aarhus","Albertslund","Allerød","Assens",
  "Ballerup","Billund","Bornholm","Brøndby","Brønderslev",
  "Dragør","Egedal","Esbjerg","Fanø","Favrskov","Faxe",
  "Fredensborg","Fredericia","Frederiksberg","Frederikshavn",
  "Frederikssund","Furesø","Faaborg-Midtfyn",
  "Gentofte","Gladsaxe","Glostrup","Greve","Gribskov","Guldborgsund",
  "Haderslev","Halsnæs","Hedensted","Helsingør","Herlev","Herning",
  "Hillerød","Hjørring","Holbæk","Holstebro","Horsens","Hvidovre",
  "Høje-Taastrup","Hørsholm","Ikast-Brande","Ishøj",
  "Jammerbugt","Kalundborg","Kerteminde","Kolding","København","Køge",
  "Langeland","Lejre","Lemvig","Lolland","Lyngby-Taarbæk","Læsø",
  "Mariagerfjord","Middelfart","Morsø","Norddjurs","Nordfyns",
  "Nyborg","Næstved","Odder","Odense","Odsherred",
  "Randers","Rebild","Ringkøbing-Skjern","Ringsted","Roskilde","Rudersdal","Rødovre",
  "Silkeborg","Skanderborg","Skive","Slagelse","Solrød","Sorø",
  "Stevns","Struer","Svendborg","Syddjurs","Sønderborg",
  "Thisted","Tønder","Tårnby","Vallensbæk","Varde","Vejen","Vejle",
  "Vesthimmerlands","Viborg","Vordingborg","Ærø",
].sort((a, b) => a.localeCompare(b, "da"));

const PAGE_SIZE = 100;

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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [fetchProgress, setFetchProgress] = useState(0);

  const toggleSet = (set: string[], val: string, setter: (v: string[]) => void) => {
    setter(set.includes(val) ? set.filter((v) => v !== val) : [...set, val]);
  };

  function buildFilters() {
    const branchCodes: string[] = [];
    for (const cat of BRANCH_CATEGORIES) {
      if (categories.includes(cat.label)) branchCodes.push(...cat.prefixes);
    }
    let minEmp: number | undefined;
    let maxEmp: number | undefined;
    if (employeeBuckets.length) {
      const buckets = EMPLOYEE_BUCKETS.filter((b) => employeeBuckets.includes(b.label));
      minEmp = Math.min(...buckets.map((b) => b.min));
      maxEmp = Math.max(...buckets.map((b) => b.max));
    }
    return { branchCodes, minEmp, maxEmp };
  }

  async function annotateExisting(items: CvrRow[]): Promise<CvrRow[]> {
    const cvrs = items.map((r) => r.cvr);
    if (!cvrs.length) return items;
    const existingSet = new Set<string>();
    for (let i = 0; i < cvrs.length; i += 500) {
      const slice = cvrs.slice(i, i + 500);
      const { data } = await supabase.from("companies").select("cvr").in("cvr", slice);
      (data ?? []).forEach((r) => r.cvr && existingSet.add(r.cvr));
    }
    return items.map((r) => ({ ...r, existing: existingSet.has(r.cvr) }));
  }

  function filterByZip(list: CvrRow[], zipList: { z: string | null }[]): CvrRow[] {
    if (!(zipFrom && zipTo)) return list;
    const from = parseInt(zipFrom, 10);
    const to = parseInt(zipTo, 10);
    if (isNaN(from) || isNaN(to)) return list;
    return list.filter((_r, i) => {
      const z = zipList[i].z;
      if (!z) return true;
      const zn = parseInt(z, 10);
      if (isNaN(zn)) return true;
      return zn >= from && zn <= to;
    });
  }

  async function fetchPage(pageNum: number, kommune: string | null) {
    const { branchCodes, minEmp, maxEmp } = buildFilters();
    const formValues = companyForms;
    const res = await lookupFn({
      data: {
        type: "bulk",
        filters: {
          ...(kommune ? { municipality: kommune } : {}),
          branch_codes: branchCodes.length ? branchCodes : undefined,
          min_employees: minEmp,
          max_employees: maxEmp,
          company_forms: formValues.length ? formValues : undefined,
          status: activeOnly ? "Aktiv" : undefined,
        } as any,
        from: pageNum * PAGE_SIZE,
      } as any,
    });
    return res;
  }

  async function runSearch() {
    if (!kommuner.length && !(zipFrom && zipTo)) {
      toast.error("Vælg mindst én kommune eller indtast postnummer-interval");
      return;
    }
    if (kommuner.length > 1) {
      toast.error("Vælg én kommune ad gangen for at få korrekt total og paginering");
      return;
    }
    setSearching(true);
    setHasSearched(true);
    setRows([]);
    setSelectedCvrs(new Set());
    setPage(0);
    setTotal(0);

    try {
      const kommune = kommuner[0] ?? null;
      const res = await fetchPage(0, kommune);
      if (!res.success) {
        toast.error("CVR-søgning fejlede: " + (res.error ?? "ukendt"));
        return;
      }
      setTotal(res.total ?? 0);
      const list = Array.isArray(res.data) ? res.data : [];
      const mapped: CvrRow[] = list.map((c) => ({
        cvr: c.cvr,
        name: c.name,
        city: c.city,
        municipality: c.municipality,
        industry: c.main_branch_text,
        employees: c.employees_interval,
        ad_protection: !!c.ad_protection,
        company_form: c.company_form,
        existing: false,
      }));
      const zipFiltered = filterByZip(
        mapped,
        list.map((c) => ({ z: c.zip })),
      );
      const annotated = await annotateExisting(zipFiltered);
      setRows(annotated);
      setSelectedCvrs(new Set(annotated.filter((r) => !r.existing).map((r) => r.cvr)));
    } finally {
      setSearching(false);
    }
  }

  async function loadPage(pageNum: number) {
    if (pageNum < 0) return;
    setSearching(true);
    try {
      const kommune = kommuners();
      const res = await fetchPage(pageNum, kommune);
      if (!res.success) {
        toast.error("CVR-søgning fejlede: " + (res.error ?? "ukendt"));
        return;
      }
      const list = Array.isArray(res.data) ? res.data : [];
      const mapped: CvrRow[] = list.map((c) => ({
        cvr: c.cvr,
        name: c.name,
        city: c.city,
        municipality: c.municipality,
        industry: c.main_branch_text,
        employees: c.employees_interval,
        ad_protection: !!c.ad_protection,
        company_form: c.company_form,
        existing: false,
      }));
      const zipFiltered = filterByZip(mapped, list.map((c) => ({ z: c.zip })));
      const annotated = await annotateExisting(zipFiltered);
      setRows(annotated);
      setPage(pageNum);
    } finally {
      setSearching(false);
    }
  }

  function kommuners(): string | null {
    return kommuner[0] ?? null;
  }

  async function fetchAndSelectAll() {
    if (total > 5000) return;
    setFetchingAll(true);
    setFetchProgress(0);
    try {
      const kommune = kommuners();
      const aggregated: CvrRow[] = [];
      const seen = new Set<string>();
      const pages = Math.ceil(total / PAGE_SIZE);
      for (let p = 0; p < pages; p++) {
        const res = await fetchPage(p, kommune);
        if (!res.success) {
          toast.error("Fejl under indlæsning: " + (res.error ?? "ukendt"));
          break;
        }
        const list = Array.isArray(res.data) ? res.data : [];
        const mapped: CvrRow[] = list.map((c) => ({
          cvr: c.cvr,
          name: c.name,
          city: c.city,
          municipality: c.municipality,
          industry: c.main_branch_text,
          employees: c.employees_interval,
          ad_protection: !!c.ad_protection,
          company_form: c.company_form,
          existing: false,
        }));
        const zipFiltered = filterByZip(mapped, list.map((c) => ({ z: c.zip })));
        for (const r of zipFiltered) {
          if (!seen.has(r.cvr)) {
            seen.add(r.cvr);
            aggregated.push(r);
          }
        }
        setFetchProgress(Math.min((p + 1) * PAGE_SIZE, total));
      }
      const annotated = await annotateExisting(aggregated);
      setRows(annotated);
      setSelectedCvrs(new Set(annotated.filter((r) => !r.existing).map((r) => r.cvr)));
      setPage(0);
    } finally {
      setFetchingAll(false);
      setFetchProgress(0);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showFrom = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const showTo = Math.min((page + 1) * PAGE_SIZE, total);

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
              <p className="text-xs text-muted-foreground mb-2">Vælg én kommune ELLER postnummer-interval</p>
              <div className="border rounded-md max-h-44 overflow-y-auto p-2 bg-background">
                <div className="grid grid-cols-2 gap-1">
                  {KOMMUNER.map((k) => (
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
                  <label key={f.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={companyForms.includes(f.value)}
                      onCheckedChange={() => toggleSet(companyForms, f.value, setCompanyForms)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <Label className="text-sm">Kun aktive virksomheder</Label>
              <Switch checked={activeOnly} onCheckedChange={setActiveOnly} />
            </div>

            <Button onClick={runSearch} disabled={searching || fetchingAll} className="w-full">
              {searching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Søg i CVR-registret
            </Button>
          </div>

          {/* Sektion B: Resultater */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                {hasSearched ? (
                  <span>
                    <strong>{total}</strong> virksomheder fundet i CVR totalt
                    {total > 0 && ` — viser ${showFrom}–${showTo}`}
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

            {hasSearched && total > 0 && (
              <div>
                {total <= 5000 ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={fetchAndSelectAll}
                    disabled={fetchingAll || searching}
                  >
                    {fetchingAll && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Hent og vælg alle {total} →
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Over 5.000 resultater — indsnævr filteret for bedre præcision
                  </p>
                )}
              </div>
            )}

            {fetchingAll && (
              <div className="space-y-1">
                <Progress value={total ? (fetchProgress / total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  Henter… {fetchProgress} af {total}
                </p>
              </div>
            )}

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

            {hasSearched && total > PAGE_SIZE && !fetchingAll && (
              <div className="flex items-center justify-between text-sm">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0 || searching}
                  onClick={() => loadPage(page - 1)}
                >
                  ← Forrige
                </Button>
                <span className="text-muted-foreground">
                  Side {page + 1} af {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(page + 1) * PAGE_SIZE >= total || searching}
                  onClick={() => loadPage(page + 1)}
                >
                  Næste →
                </Button>
              </div>
            )}
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
