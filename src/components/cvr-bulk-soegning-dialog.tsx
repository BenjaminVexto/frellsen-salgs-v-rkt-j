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
import { createImportBatch } from "@/lib/admin-companies.functions";
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

// Svarer til CVR's intervalkoder efter ANTAL_-prefix er fjernet
const EMPLOYEE_BUCKETS: { label: string; codes: string[] }[] = [
  { label: "0",       codes: ["0"]       },
  { label: "1",       codes: ["1"]       },
  { label: "2-4",     codes: ["2_4"]     },
  { label: "5-9",     codes: ["5_9"]     },
  { label: "10-19",   codes: ["10_19"]   },
  { label: "20-49",   codes: ["20_49"]   },
  { label: "50-99",   codes: ["50_99"]   },
  { label: "100-199", codes: ["100_199"] },
  { label: "200-499", codes: ["200_499"] },
  { label: "500-999", codes: ["500_999"] },
  { label: "1000+",   codes: ["1000_"]   },
];

const COMPANY_FORMS: { label: string; value: string }[] = [
  { label: "A/S",                 value: "Aktieselskab"          },
  { label: "ApS",                 value: "Anpartsselskab"        },
  { label: "I/S",                 value: "Interessentskab"       },
  { label: "K/S",                 value: "Kommanditselskab"      },
  { label: "Enkeltmandsfirma",    value: "Enkeltmandsvirksomhed" },
  { label: "Forening",            value: "Forening"              },
  { label: "Kommune/Region/Stat", value: "Kommune"               },
  { label: "Øvrige",              value: "Øvrige"                },
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
const ROWS_PER_PAGE = 100;

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
  zip: string | null;
};

// Filtrer på ansatte client-side. employees-værdien er ANTAL_-prefix fjernet,
// fx "20_49", "5_9", "1000_", null. Virksomheder med null passerer filteret.
function matchesEmployeeFilter(
  employees: string | null,
  selectedBuckets: string[],
): boolean {
  if (!selectedBuckets.length) return true;
  if (!employees) return true;
  const selectedCodes = EMPLOYEE_BUCKETS
    .filter((b) => selectedBuckets.includes(b.label))
    .flatMap((b) => b.codes);
  return selectedCodes.includes(employees);
}

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

  // Filtre
  const [kommune, setKommune] = useState("");
  const [zipFrom, setZipFrom] = useState("");
  const [zipTo, setZipTo] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [employeeBuckets, setEmployeeBuckets] = useState<string[]>([]);
  const [companyForms, setCompanyForms] = useState<string[]>([]);

  // Resultater
  const [filteredRows, setFilteredRows] = useState<CvrRow[]>([]);
  const [selectedCvrs, setSelectedCvrs] = useState<Set<string>>(new Set());
  const [esTotalBeforeEmpFilter, setEsTotalBeforeEmpFilter] = useState(0);
  const [page, setPage] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  // Loading states
  const [searching, setSearching] = useState(false);
  const [fetchingAll, setFetchingAll] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ current: 0, total: 0 });
  const [importing, setImporting] = useState(false);

  function toggleItem(arr: string[], val: string, setter: (v: string[]) => void) {
    setter(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  }

  function getBranchCodes(): string[] {
    return BRANCH_CATEGORIES
      .filter((c) => categories.includes(c.label))
      .flatMap((c) => c.prefixes);
  }

  function applyEmployeeFilter(items: CvrRow[]): CvrRow[] {
    return items.filter((r) => matchesEmployeeFilter(r.employees, employeeBuckets));
  }

  function applyZipFilter(items: CvrRow[]): CvrRow[] {
    if (!zipFrom || !zipTo) return items;
    const from = parseInt(zipFrom, 10);
    const to = parseInt(zipTo, 10);
    if (isNaN(from) || isNaN(to)) return items;
    return items.filter((r) => {
      if (!r.zip) return true;
      const z = parseInt(r.zip, 10);
      return !isNaN(z) && z >= from && z <= to;
    });
  }

  async function annotateExisting(items: CvrRow[]): Promise<CvrRow[]> {
    const cvrs = items.map((r) => r.cvr);
    if (!cvrs.length) return items;
    const existingSet = new Set<string>();
    for (let i = 0; i < cvrs.length; i += 500) {
      const { data } = await supabase
        .from("companies")
        .select("cvr")
        .in("cvr", cvrs.slice(i, i + 500));
      (data ?? []).forEach((r: any) => r.cvr && existingSet.add(r.cvr));
    }
    return items.map((r) => ({ ...r, existing: existingSet.has(r.cvr) }));
  }

  function buildRequestFilters() {
    const branchCodes = getBranchCodes();
    return {
      ...(kommune ? { municipality: kommune } : {}),
      ...(branchCodes.length ? { branch_codes: branchCodes } : {}),
      ...(companyForms.length ? { company_forms: companyForms } : {}),
    };
  }

  async function fetchOnePage(from: number) {
    return lookupFn({
      data: {
        type: "bulk",
        filters: buildRequestFilters() as any,
        from,
      } as any,
    });
  }

  function mapToRow(c: any): CvrRow {
    return {
      cvr: c.cvr,
      name: c.name,
      city: c.city,
      municipality: c.municipality,
      industry: c.main_branch_text,
      employees: c.employees_interval,
      ad_protection: !!c.ad_protection,
      company_form: c.company_form,
      existing: false,
      zip: c.zip,
    };
  }

  async function runSearch() {
    if (!kommune && !(zipFrom && zipTo)) {
      toast.error("Vælg en kommune eller postnummer-interval");
      return;
    }

    setSearching(true);
    setHasSearched(true);
    setFilteredRows([]);
    setSelectedCvrs(new Set());
    setPage(0);
    setEsTotalBeforeEmpFilter(0);

    try {
      const res = await fetchOnePage(0);
      if (!res.success) {
        toast.error("CVR-søgning fejlede: " + (res.error ?? "ukendt"));
        return;
      }
      const esTotal = res.total ?? 0;
      setEsTotalBeforeEmpFilter(esTotal);

      const list = Array.isArray(res.data) ? res.data : [];
      const mapped = list.map(mapToRow);
      const zipFiltered = applyZipFilter(mapped);
      const empFiltered = applyEmployeeFilter(zipFiltered);
      const annotated = await annotateExisting(empFiltered);

      setFilteredRows(annotated);
      setSelectedCvrs(new Set(annotated.filter((r) => !r.existing).map((r) => r.cvr)));
    } finally {
      setSearching(false);
    }
  }

  async function fetchAndSelectAll() {
    setFetchingAll(true);
    setFetchProgress({ current: 0, total: esTotalBeforeEmpFilter });
    const aggregated: CvrRow[] = [];
    const seen = new Set<string>();
    const pages = Math.ceil(esTotalBeforeEmpFilter / PAGE_SIZE);

    try {
      for (let p = 0; p < pages; p++) {
        const res = await fetchOnePage(p * PAGE_SIZE);
        if (!res.success) {
          toast.error("Fejl under hentning: " + (res.error ?? "ukendt"));
          break;
        }
        const list = Array.isArray(res.data) ? res.data : [];
        const mapped = list.map(mapToRow);
        const zipFiltered = applyZipFilter(mapped);
        const empFiltered = applyEmployeeFilter(zipFiltered);
        for (const r of empFiltered) {
          if (!seen.has(r.cvr)) {
            seen.add(r.cvr);
            aggregated.push(r);
          }
        }
        setFetchProgress({
          current: Math.min((p + 1) * PAGE_SIZE, esTotalBeforeEmpFilter),
          total: esTotalBeforeEmpFilter,
        });
      }

      const annotated = await annotateExisting(aggregated);
      setFilteredRows(annotated);
      setSelectedCvrs(new Set(annotated.filter((r) => !r.existing).map((r) => r.cvr)));
      setPage(0);
      toast.success(
        `${annotated.length.toLocaleString("da")} virksomheder matcher ALLE filtre inkl. ansatte` +
        ` (hentet og filtreret fra ${esTotalBeforeEmpFilter.toLocaleString("da")} i CVR)`,
      );
    } finally {
      setFetchingAll(false);
    }
  }

  async function doImport() {
    const chosen = filteredRows.filter((r) => selectedCvrs.has(r.cvr));
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
      toast.success(`Importeret: ${res.inserted} nye, ${res.already_existed} fandtes allerede`);
      onImported(res.company_ids);
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Import fejlede: " + (e?.message ?? "ukendt"));
    } finally {
      setImporting(false);
    }
  }

  const pagedRows = filteredRows.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const empFilterActive = employeeBuckets.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Søg nye emner i CVR-registret</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          {/* Filtre */}
          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Geografi *</Label>
              <p className="text-xs text-muted-foreground">Vælg én kommune ELLER postnummer-interval</p>
              <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1">
                {KOMMUNER.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="kommune"
                      checked={kommune === k}
                      onChange={() => setKommune(kommune === k ? "" : k)}
                      onClick={() => setKommune(kommune === k ? "" : k)}
                      className="accent-primary"
                    />
                    {k}
                  </label>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Postnr. fra"
                  value={zipFrom}
                  onChange={(e) => setZipFrom(e.target.value)}
                />
                <Input
                  placeholder="Postnr. til"
                  value={zipTo}
                  onChange={(e) => setZipTo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Branchekategori *</Label>
              <div className="space-y-1">
                {BRANCH_CATEGORIES.map((cat) => (
                  <label key={cat.label} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={categories.includes(cat.label)}
                      onCheckedChange={() => toggleItem(categories, cat.label, setCategories)}
                    />
                    {cat.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Antal ansatte</Label>
              <p className="text-xs text-muted-foreground">Filtreres efter søgning baseret på aktuelle tal</p>
              <div className="space-y-1">
                {EMPLOYEE_BUCKETS.map((b) => (
                  <label key={b.label} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={employeeBuckets.includes(b.label)}
                      onCheckedChange={() => toggleItem(employeeBuckets, b.label, setEmployeeBuckets)}
                    />
                    {b.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Virksomhedsform *</Label>
              <div className="space-y-1">
                {COMPANY_FORMS.map((f) => (
                  <label key={f.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={companyForms.includes(f.value)}
                      onCheckedChange={() => toggleItem(companyForms, f.value, setCompanyForms)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={runSearch} disabled={searching || fetchingAll} className="w-full">
              {searching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Søger…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Søg i CVR-registret
                </>
              )}
            </Button>
          </div>

          {/* Resultater */}
          <div className="space-y-3">
            {hasSearched && (
              <div className="space-y-1">
                <div className="text-sm">
                  <strong>{esTotalBeforeEmpFilter.toLocaleString("da")}</strong>{" "}
                  virksomheder fundet i CVR
                  {empFilterActive && (
                    <span className="text-muted-foreground font-normal">
                      {" "}(antal ansatte filtreres separat)
                    </span>
                  )}
                  {filteredRows.length > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {` · viser ${filteredRows.length.toLocaleString("da")} efter lokale filtre · ${selectedCvrs.size} valgt`}
                    </span>
                  )}
                </div>
                {empFilterActive && (
                  <p className="text-xs text-muted-foreground">
                    * Ansatte-filteret bruger aktuelle tal — virksomheder uden ansatte-data vises også
                  </p>
                )}
              </div>
            )}

            {hasSearched && filteredRows.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelectedCvrs(
                      new Set(filteredRows.filter((r) => !r.existing).map((r) => r.cvr)),
                    )
                  }
                >
                  Vælg alle nye
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedCvrs(new Set())}>
                  Ryd
                </Button>
                {esTotalBeforeEmpFilter > filteredRows.length &&
                  esTotalBeforeEmpFilter <= 5000 &&
                  !fetchingAll && (
                    <Button size="sm" onClick={fetchAndSelectAll}>
                      Hent og vælg alle {esTotalBeforeEmpFilter} →
                    </Button>
                  )}
                {esTotalBeforeEmpFilter > 5000 && (
                  <span className="text-xs text-destructive">
                    Over 5.000 resultater — indsnævr filtrene
                  </span>
                )}
              </div>
            )}

            {fetchingAll && (
              <div className="space-y-1">
                <Progress
                  value={
                    fetchProgress.total
                      ? (fetchProgress.current / fetchProgress.total) * 100
                      : 0
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Henter… {fetchProgress.current.toLocaleString("da")} af{" "}
                  {fetchProgress.total.toLocaleString("da")}
                </p>
              </div>
            )}

            <div className="border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Navn</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Branche</TableHead>
                    <TableHead>Ansatte</TableHead>
                    <TableHead>I systemet</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        {searching
                          ? "Søger…"
                          : hasSearched
                            ? "Ingen resultater"
                            : "Konfigurér filtre og søg"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((r) => (
                      <TableRow key={r.cvr}>
                        <TableCell>
                          <Checkbox
                            checked={selectedCvrs.has(r.cvr)}
                            onCheckedChange={() => {
                              setSelectedCvrs((prev) => {
                                const next = new Set(prev);
                                if (next.has(r.cvr)) next.delete(r.cvr);
                                else next.add(r.cvr);
                                return next;
                              });
                            }}
                          />
                        </TableCell>
                        <TableCell>{r.name ?? "—"}</TableCell>
                        <TableCell>{r.city ?? "—"}</TableCell>
                        <TableCell>{r.industry ?? "—"}</TableCell>
                        <TableCell>{r.employees ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={r.existing ? "secondary" : "outline"}>
                            {r.existing ? "Ja" : "Nej"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.ad_protection && (
                            <ShieldAlert className="h-4 w-4 text-amber-500" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {filteredRows.length > ROWS_PER_PAGE && (
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Forrige
                </Button>
                <span className="text-sm text-muted-foreground">
                  Side {page + 1} af {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Næste →
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={doImport} disabled={importing || selectedCvrs.size === 0}>
            {importing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Importér {selectedCvrs.size} valgte til systemet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
