import { useState, useEffect, useMemo, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { KOMMUNE_KODER, REGION_KOMMUNER } from "@/lib/cvr-kommuner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { cvrBulkSide } from "@/lib/cvr-lookup.functions";
import { matchesEmployeeCodes } from "@/lib/cvr-bulk-query";
import { importCompaniesFromCvr } from "@/lib/cvr-import.functions";
import {
  createImportBatch,
  importAssignSellersToCompanies,
} from "@/lib/admin-companies.functions";
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
  { label: "0",       codes: ["0_0"] },
  { label: "1",       codes: ["1_1"] },
  { label: "2-4",     codes: ["2_4"]     },
  { label: "5-9",     codes: ["5_9"]     },
  { label: "10-19",   codes: ["10_19"]   },
  { label: "20-49",   codes: ["20_49"]   },
  { label: "50-99",   codes: ["50_99"]   },
  { label: "100-199", codes: ["100_199"] },
  { label: "200-499", codes: ["200_499"] },
  { label: "500-999", codes: ["500_999"] },
  { label: "1000+",   codes: ["1000_999999"] },
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
  existing: CrmMatch | null;
  pnumre: string[];
  zip: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  penheder: number;
};

type MatchType = "cvr" | "parent_cvr" | "penhed" | "adresse" | "telefon";
type CrmMatch = { type: MatchType; company_id: string; company_name: string | null; kundenr: string | null };
const USIKKER: MatchType[] = ["adresse", "telefon"];
const MATCH_LABEL: Record<MatchType, string> = {
  cvr: "CVR", parent_cvr: "moder-CVR", penhed: "P-enhed", adresse: "adresse", telefon: "telefon",
};
const FIRST_PAGE = 100;
const FETCH_PAGE = 1000;
const STOR_LISTE = 3000;

export function CvrBulkSoegningDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: (companyIds: string[]) => void;
}) {
  const bulkFn = useServerFn(cvrBulkSide);
  const abortRef = useRef(false);
  const importFn = useServerFn(importCompaniesFromCvr);
  const createBatch = useServerFn(createImportBatch);
  const assignSellersFn = useServerFn(importAssignSellersToCompanies);

  // Sælgere
  const [sellers, setSellers] = useState<{ id: string; full_name: string }[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "saelger");
      const ids = (roles ?? []).map((r: any) => r.user_id);
      if (!ids.length) {
        setSellers([]);
        return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .in("id", ids);
      setSellers(
        (profs ?? [])
          .filter((p: any) => p.is_active !== false)
          .map((p: any) => ({ id: p.id, full_name: p.full_name || "(uden navn)" }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name, "da")),
      );
    })();
  }, [open]);

  // Filtre
  const [kommuner, setKommuner] = useState<string[]>([]);
  const [kommuneQ, setKommuneQ] = useState("");
  const [regioner, setRegioner] = useState<string[]>([]);
  const [branchQuery, setBranchQuery] = useState("");
  const [includeNoEmp, setIncludeNoEmp] = useState(false);
  const [showShaky, setShowShaky] = useState(false);
  const [includeExisting, setIncludeExisting] = useState(false);
  const [includeCeased, setIncludeCeased] = useState(false);
  const [hideProtected, setHideProtected] = useState(true);
  const [onlyPhone, setOnlyPhone] = useState(false);
  const [confirmProtected, setConfirmProtected] = useState(false);
  const [zipFrom, setZipFrom] = useState("");
  const [zipTo, setZipTo] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [employeeBuckets, setEmployeeBuckets] = useState<string[]>([]);
  const [companyForms, setCompanyForms] = useState<string[]>([]);

  // Resultater
  const [allRows, setAllRows] = useState<CvrRow[]>([]);
  const [selectedCvrs, setSelectedCvrs] = useState<Set<string>>(new Set());
  const [esTotalBeforeEmpFilter, setEsTotalBeforeEmpFilter] = useState(0);
  const [nextKey, setNextKey] = useState<string | null>(null);
  const [fetchSecs, setFetchSecs] = useState<number | null>(null);
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
    const fromCats = BRANCH_CATEGORIES
      .filter((c) => categories.includes(c.label))
      .flatMap((c) => c.prefixes);
    const typed = branchQuery.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{2,6}$/.test(x));
    return Array.from(new Set([...fromCats, ...typed]));
  }

  function getMunicipalityCodes(): string[] {
    const codes = new Set<string>();
    kommuner.forEach((k) => KOMMUNE_KODER[k] && codes.add(KOMMUNE_KODER[k]));
    regioner.forEach((r) => (REGION_KOMMUNER[r] ?? []).forEach((c) => codes.add(c)));
    return Array.from(codes);
  }

  function selectedEmpCodes(): string[] {
    return EMPLOYEE_BUCKETS.filter((b) => employeeBuckets.includes(b.label)).flatMap((b) => b.codes);
  }
  // Lokale efterfiltre (samme ansatte-prioritet som ES), eksisterende, reklamebeskyttelse, telefon
  const empPassed = useMemo(
    () => allRows.filter((r) => matchesEmployeeCodes(r.employees, selectedEmpCodes(), includeNoEmp)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allRows, employeeBuckets, includeNoEmp],
  );
  const noEmpCount = useMemo(() => allRows.filter((r) => !r.employees).length, [allRows]);
  const excludedByType = useMemo(() => {
    const m: Partial<Record<MatchType, number>> = {};
    for (const r of empPassed) {
      if (!r.existing) continue;
      if (includeExisting) continue;
      if (showShaky && USIKKER.includes(r.existing.type)) continue;
      m[r.existing.type] = (m[r.existing.type] ?? 0) + 1;
    }
    return m;
  }, [empPassed, includeExisting, showShaky]);
  const existingCount = useMemo(() => empPassed.filter((r) => r.existing).length, [empPassed]);
  const shakyCount = useMemo(
    () => empPassed.filter((r) => r.existing && USIKKER.includes(r.existing.type)).length,
    [empPassed],
  );
  const afterExisting = useMemo(
    () =>
      includeExisting
        ? empPassed
        : empPassed.filter((r) => !r.existing || (showShaky && USIKKER.includes(r.existing.type))),
    [empPassed, includeExisting, showShaky],
  );
  const protectedCount = useMemo(() => afterExisting.filter((r) => r.ad_protection).length, [afterExisting]);
  const afterProtected = useMemo(
    () => (hideProtected ? afterExisting.filter((r) => !r.ad_protection) : afterExisting),
    [afterExisting, hideProtected],
  );
  const noPhoneCount = useMemo(() => afterProtected.filter((r) => !r.phone).length, [afterProtected]);
  const filteredRows = useMemo(
    () => (onlyPhone ? afterProtected.filter((r) => !!r.phone) : afterProtected),
    [afterProtected, onlyPhone],
  );

  function defaultSelection(rows: CvrRow[]): Set<string> {
    return new Set(rows.filter((r) => !r.existing && !r.ad_protection).map((r) => r.cvr));
  }

  // Ved ændring af lokale filtre: fjern valg der ikke længere er synlige
  useEffect(() => {
    const visible = new Set(filteredRows.map((r) => r.cvr));
    setSelectedCvrs((prev) => {
      const next = new Set([...prev].filter((c) => visible.has(c)));
      return next.size === prev.size ? prev : next;
    });
    setPage(0);
  }, [filteredRows]);

  async function annotateExisting(items: CvrRow[]): Promise<CvrRow[]> {
    if (!items.length) return items;
    const matches = new Map<string, CrmMatch>();
    const ikkeKontakt = new Set<string>();
    for (let i = 0; i < items.length; i += 500) {
      const slice = items.slice(i, i + 500).map((r) => ({
        cvr: r.cvr, pnumre: r.pnumre, address: r.address, zip: r.zip, phone: r.phone,
      }));
      const { data, error } = await supabase.rpc("cvr_findes_i_crm", { cvr_rows: slice as any });
      if (error) throw new Error(error.message);
      (data ?? []).forEach((m: any) => {
        matches.set(m.cvr, { type: m.match_type, company_id: m.company_id, company_name: m.company_name, kundenr: m.kundenr });
        if (m.ikke_kontakt) ikkeKontakt.add(m.cvr);
      });
    }
    // "Ønsker ikke kontakt" fjernes altid fra CVR-søgninger.
    return items
      .filter((r) => !ikkeKontakt.has(r.cvr))
      .map((r) => ({ ...r, existing: matches.get(r.cvr) ?? null }));
  }

  function buildRequestFilters() {
    const branchCodes = getBranchCodes();
    const zf = parseInt(zipFrom, 10);
    const zt = parseInt(zipTo, 10);
    const emp = selectedEmpCodes();
    return {
      ...(getMunicipalityCodes().length ? { municipality_codes: getMunicipalityCodes() } : {}),
      ...(includeCeased ? { include_ceased: true } : {}),
      ...(branchCodes.length ? { branch_codes: branchCodes } : {}),
      ...(companyForms.length ? { company_forms: companyForms } : {}),
      ...(emp.length ? { employee_codes: emp, include_unknown_employees: includeNoEmp } : {}),
      ...(onlyPhone ? { only_phone: true } : {}),
      ...(!isNaN(zf) ? { zip_from: zf } : {}),
      ...(!isNaN(zt) ? { zip_to: zt } : {}),
    };
  }

  async function fetchPage(after: string | null, size: number) {
    const raw = await bulkFn({ data: { filters: buildRequestFilters(), search_after: after, size } });
    return JSON.parse(raw) as { success: boolean; error?: string; data?: any[]; total?: number; next?: string | null };
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
      existing: null,
      pnumre: c.pnumre ?? [],
      zip: c.zip,
      address: c.address ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
      website: c.website ?? null,
      penheder: c.penheder_count ?? 0,
    };
  }

  async function runSearch() {
    if (!getMunicipalityCodes().length && !(zipFrom && zipTo)) {
      toast.error("Vælg kommune(r), region(er) eller et postnummer-interval");
      return;
    }
    setSearching(true);
    setHasSearched(true);
    setAllRows([]);
    setSelectedCvrs(new Set());
    setPage(0);
    setEsTotalBeforeEmpFilter(0);
    setFetchSecs(null);
    try {
      const res = await fetchPage(null, FIRST_PAGE);
      if (!res.success) {
        toast.error("CVR-søgning fejlede: " + (res.error ?? "ukendt"));
        return;
      }
      setEsTotalBeforeEmpFilter(res.total ?? 0);
      setNextKey(res.next ?? null);
      const annotated = await annotateExisting((res.data ?? []).map(mapToRow));
      setAllRows(annotated);
      setSelectedCvrs(defaultSelection(annotated.filter((r) => matchesEmployeeCodes(r.employees, selectedEmpCodes(), includeNoEmp) && (!onlyPhone || r.phone))));
    } catch (e: any) {
      toast.error("CVR-søgning fejlede: " + (e?.message ?? "ukendt"));
    } finally {
      setSearching(false);
    }
  }

  async function fetchAndSelectAll() {
    const total = esTotalBeforeEmpFilter;
    abortRef.current = false;
    setFetchingAll(true);
    const t0 = performance.now();
    const seen = new Set(allRows.map((r) => r.cvr));
    const aggregated: CvrRow[] = [...allRows];
    let after = nextKey;
    let fetched = allRows.length;
    setFetchProgress({ current: fetched, total });
    try {
      while (after && !abortRef.current) {
        const res = await fetchPage(after, FETCH_PAGE);
        if (!res.success) {
          toast.error("Fejl under hentning: " + (res.error ?? "ukendt"));
          break;
        }
        const list = res.data ?? [];
        fetched += list.length;
        const fresh = list.map(mapToRow).filter((r) => !seen.has(r.cvr));
        fresh.forEach((r) => seen.add(r.cvr));
        aggregated.push(...(await annotateExisting(fresh)));
        after = list.length ? (res.next ?? null) : null;
        setFetchProgress({ current: Math.min(fetched, total), total });
      }
      setNextKey(after);
      setAllRows([...aggregated]);
      setSelectedCvrs(defaultSelection(aggregated.filter((r) => matchesEmployeeCodes(r.employees, selectedEmpCodes(), includeNoEmp) && (!onlyPhone || r.phone))));
      setPage(0);
      const secs = Math.round((performance.now() - t0) / 100) / 10;
      setFetchSecs(secs);
      toast.success(
        `${aggregated.length.toLocaleString("da")} af ${total.toLocaleString("da")} hentet på ${secs.toLocaleString("da")} sek.` +
          (abortRef.current ? " (afbrudt)" : ""),
      );
    } catch (e: any) {
      toast.error("Fejl under hentning: " + (e?.message ?? "ukendt"));
    } finally {
      setFetchingAll(false);
    }
  }

  async function doImport(force = false) {
    const chosen = filteredRows.filter((r) => selectedCvrs.has(r.cvr));
    if (!chosen.length) {
      toast.error("Vælg mindst én virksomhed");
      return;
    }
    if (!force && chosen.some((r) => r.ad_protection)) {
      setConfirmProtected(true);
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
          address: r.address,
          zip: r.zip,
          phone: r.phone,
          email: r.email,
          website: r.website,
          municipality: r.municipality,
          industry: r.industry,
          employees_interval: r.employees,
          company_form: r.company_form,
          pnumre: r.pnumre.slice(0, 500),
        }));
      const res = await importFn({ data: { companies: payload } });
      const newIds: string[] = (res as any).inserted_ids ?? [];
      if (newIds.length) {
        try {
          const labelBits: string[] = [];
          if (regioner.length) labelBits.push(regioner.join(", "));
          if (kommuner.length) labelBits.push(kommuner.join(", "));
          if (zipFrom || zipTo) labelBits.push(`postnr ${zipFrom || "…"}–${zipTo || "…"}`);
          const dateLabel = new Date().toLocaleDateString("da-DK", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
          const filename = `CVR-søgning · ${labelBits.join(" · ") || "alle"} · ${dateLabel}`;
          await createBatch({
            data: {
              filename,
              company_count: newIds.length,
              company_ids: newIds,
            },
          });
        } catch (e: any) {
          console.error("Kunne ikke registrere CVR-import-batch", e);
        }
      }
      const withPhone = chosen.filter((r) => r.phone).length;
      toast.success(
        `Importeret: ${res.inserted} nye, ${res.already_existed} fandtes allerede · ${withPhone} af ${chosen.length} med telefonnummer`,
      );
      const allIds: string[] = res.company_ids ?? [];
      if (selectedSellerId && allIds.length) {
        try {
          const r = await assignSellersFn({
            data: {
              assignments: allIds.map((id) => ({
                company_id: id,
                seller_id: selectedSellerId,
              })),
            },
          });
          const sellerName =
            sellers.find((s) => s.id === selectedSellerId)?.full_name ?? "sælger";
          toast.success(`Tildelt ${r.updated} virksomheder til ${sellerName}`);
        } catch (e: any) {
          toast.error("Sælger-tildeling fejlede: " + (e?.message ?? "ukendt"));
        }
      }
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
              <p className="text-xs text-muted-foreground">Regioner og/eller kommuner – eller et postnummer-interval</p>
              <div className="flex flex-wrap gap-1">
                {Object.keys(REGION_KOMMUNER).map((rg) => (
                  <Button
                    key={rg}
                    type="button"
                    size="sm"
                    variant={regioner.includes(rg) ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => toggleItem(regioner, rg, setRegioner)}
                  >
                    {rg}
                  </Button>
                ))}
              </div>
              <Input
                placeholder="Søg kommune…"
                value={kommuneQ}
                onChange={(e) => setKommuneQ(e.target.value)}
                className="h-8"
              />
              <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
                {KOMMUNER.filter((k) => k.toLowerCase().includes(kommuneQ.toLowerCase()))
                  .sort((a, b) => Number(kommuner.includes(b)) - Number(kommuner.includes(a)))
                  .map((k) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={kommuner.includes(k)}
                      onCheckedChange={() => toggleItem(kommuner, k, setKommuner)}
                    />
                    {k}
                  </label>
                ))}
              </div>
              {kommuner.length > 0 && (
                <p className="text-xs text-muted-foreground">{kommuner.length} kommuner valgt</p>
              )}
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
              <Input
                placeholder="DB07-koder/præfikser, fx 56, 862100"
                value={branchQuery}
                onChange={(e) => setBranchQuery(e.target.value)}
                className="h-8"
              />
            </div>

            <div className="space-y-2">
              <Label>Antal ansatte</Label>
              <p className="text-xs text-muted-foreground">Filtreres i CVR på nyeste tal (måned → kvartal → år) – kræver ny søgning</p>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={includeNoEmp} onCheckedChange={setIncludeNoEmp} />
                Medtag virksomheder uden ansatte-data
                {hasSearched && <span className="text-xs text-muted-foreground">({noEmpCount})</span>}
              </label>
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

            <div className="space-y-2">
              <Label>Udeluk</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={includeExisting} onCheckedChange={setIncludeExisting} />
                Medtag virksomheder der allerede findes
                {hasSearched && <span className="text-xs text-muted-foreground">({existingCount})</span>}
              </label>
              {!includeExisting && (
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Switch checked={showShaky} onCheckedChange={setShowShaky} />
                  Vis usikre match (adresse/telefon)
                  {hasSearched && <span className="text-xs text-muted-foreground">({shakyCount})</span>}
                </label>
              )}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={includeCeased} onCheckedChange={setIncludeCeased} />
                Medtag ophørte (kræver ny søgning)
              </label>
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
                  virksomheder fundet i CVR efter filtre
                  {` · ${allRows.length.toLocaleString("da")} hentet`}
                  {fetchSecs != null && ` på ${fetchSecs.toLocaleString("da")} sek.`}
                  {filteredRows.length > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {` · viser ${filteredRows.length.toLocaleString("da")} efter lokale filtre · ${selectedCvrs.size} valgt`}
                    </span>
                  )}
                </div>
                {Object.keys(excludedByType).length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {Object.values(excludedByType).reduce((a, b) => a + (b ?? 0), 0).toLocaleString("da")} udeladt (findes i CRM):{" "}
                    {(Object.entries(excludedByType) as [MatchType, number][])
                      .map(([t, n]) => `${n.toLocaleString("da")} ${MATCH_LABEL[t]}`)
                      .join(" · ")}
                  </p>
                )}
                {empFilterActive && includeNoEmp && (
                  <p className="text-xs text-muted-foreground">* Virksomheder uden ansatte-data er medtaget</p>
                )}
              </div>
            )}

            {hasSearched && (
              <div className="flex flex-wrap gap-4 items-center text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={hideProtected} onCheckedChange={setHideProtected} />
                  Skjul reklamebeskyttede
                  <span className="text-xs text-muted-foreground">
                    ({protectedCount} {hideProtected ? "skjult" : "vist"})
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={onlyPhone} onCheckedChange={setOnlyPhone} />
                  Kun med telefonnummer (kræver ny søgning)
                  <span className="text-xs text-muted-foreground">({noPhoneCount} uden)</span>
                </label>
              </div>
            )}

            {hasSearched && filteredRows.length > 0 && (
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSelectedCvrs(defaultSelection(filteredRows))
                  }
                >
                  Vælg alle nye
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedCvrs(new Set())}>
                  Ryd
                </Button>
                {nextKey && allRows.length < esTotalBeforeEmpFilter && !fetchingAll && (
                  <Button size="sm" onClick={fetchAndSelectAll}>
                    Hent og vælg alle {esTotalBeforeEmpFilter.toLocaleString("da")} →
                  </Button>
                )}
                {esTotalBeforeEmpFilter > STOR_LISTE && (
                  <span className="text-xs text-destructive">
                    Stor liste – overvej at indsnævre filtrene
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
                  {fetchProgress.total.toLocaleString("da")}{" "}
                  <button type="button" className="underline ml-2" onClick={() => (abortRef.current = true)}>
                    Afbryd
                  </button>
                </p>
              </div>
            )}

            <div className="border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Navn</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead>Branche</TableHead>
                    <TableHead>Ansatte</TableHead>
                    <TableHead>I systemet</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-6">
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
                        <TableCell className="whitespace-nowrap tabular-nums">{r.phone ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.address ?? "—"}
                          <div className="text-muted-foreground">{[r.zip, r.city].filter(Boolean).join(" ")}</div>
                        </TableCell>
                        <TableCell>{r.industry ?? "—"}</TableCell>
                        <TableCell>{r.employees ?? "—"}</TableCell>
                        <TableCell>
                          {r.existing ? (
                            <a
                              href={`/virksomheder/${r.existing.company_id}`}
                              target="_blank"
                              rel="noreferrer"
                              title={`Matchet på ${MATCH_LABEL[r.existing.type]}: ${r.existing.company_name ?? ""}${r.existing.kundenr ? ` (kundenr. ${r.existing.kundenr})` : ""} – åbn kundekortet`}
                            >
                              <Badge variant={USIKKER.includes(r.existing.type) ? "outline" : "secondary"} className="whitespace-nowrap">
                                Ja · {MATCH_LABEL[r.existing.type]}
                                {USIKKER.includes(r.existing.type) && r.existing.company_name
                                  ? ` (${r.existing.company_name}${r.existing.kundenr ? `, ${r.existing.kundenr}` : ""})`
                                  : ""}
                              </Badge>
                            </a>
                          ) : (
                            <Badge variant="outline">Nej</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.ad_protection && (
                            <span title="Reklamebeskyttet"><ShieldAlert className="h-4 w-4 text-destructive" /></span>
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

        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 mr-auto">
            <Label htmlFor="cvr-seller" className="text-sm whitespace-nowrap">
              Tildel sælger
            </Label>
            <Select
              value={selectedSellerId || "none"}
              onValueChange={(v) => setSelectedSellerId(v === "none" ? "" : v)}
            >
              <SelectTrigger id="cvr-seller" className="w-[220px]">
                <SelectValue placeholder="Ingen tildeling" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen tildeling</SelectItem>
                {sellers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={() => doImport()} disabled={importing || selectedCvrs.size === 0}>
            {importing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Importér {selectedCvrs.size} valgte til systemet
          </Button>
        </DialogFooter>
      </DialogContent>
      <AlertDialog open={confirmProtected} onOpenChange={setConfirmProtected}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reklamebeskyttede virksomheder valgt</AlertDialogTitle>
            <AlertDialogDescription>
              {filteredRows.filter((r) => selectedCvrs.has(r.cvr) && r.ad_protection).length} af de valgte
              virksomheder er reklamebeskyttede og må ikke kontaktes med telemarketing. Vil du importere dem alligevel?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmProtected(false); doImport(true); }}>
              Importér alligevel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
