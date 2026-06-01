import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  Lightbulb,
  Download,
  Loader2,
  Search,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { cvrSearchTwins } from "@/lib/cvr-lookup.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/salgsintelligens")({
  component: SalgsintelligensPage,
});

type Tab = "mersalg" | "tvillinger";

function SalgsintelligensPage() {
  const [tab, setTab] = useState<Tab>("mersalg");

  const tabs: { key: Tab; label: string }[] = [
    { key: "mersalg", label: "Flere afdelinger" },
    { key: "tvillinger", label: "Tvillinger" },
  ];

  return (
    <div className="px-4 md:px-6 py-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <span className="relative inline-flex h-6 w-6 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-warning/30 blur-md animate-pulse" aria-hidden="true" />
            <Lightbulb className="relative h-6 w-6 text-warning drop-shadow-[0_0_6px_var(--warning)]" />
          </span>
          Salgsintelligens
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find skjulte salgsmuligheder i din portefølje.
        </p>
      </div>

      <div className="flex overflow-x-auto scrollbar-hide border-b border-border mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-shrink-0 px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "mersalg" && <HorisontalMersalg />}
      {tab === "tvillinger" && <Tvillinger />}
    </div>
  );
}

/* ---------- shared helpers ---------- */

function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [header.map(esc).join(";")];
  for (const r of rows) lines.push(r.map(esc).join(";"));
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Profile = { id: string; full_name: string };
function useProfiles() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("is_active", true)
      .then(({ data }) => setProfiles((data ?? []) as Profile[]));
  }, []);
  const map = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of profiles) m.set(p.id, p.full_name);
    return m;
  }, [profiles]);
  return { profiles, map };
}

/* ---------- TAB 1: Horisontal mersalg ---------- */

type MersalgRow = {
  id: string;
  name: string;
  city: string | null;
  cvr: string | null;
  ourLocations: number;
  cvrLocations: number;
  potential: number;
  assigned_to: string | null;
};

function HorisontalMersalg() {
  const { profiles, map: profileMap } = useProfiles();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MersalgRow[]>([]);
  const [seller, setSeller] = useState<string>("__all");
  const [minPot, setMinPot] = useState<number>(1);
  const [didAnalyze, setDidAnalyze] = useState(false);

  async function analyse() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, city, cvr, cvr_p_enhed_count, assigned_to, locations(count)")
        .eq("is_public", false)
        .not("cvr", "is", null)
        .not("cvr_p_enhed_count", "is", null)
        .contains("sources", ["visma"])
        .order("cvr_p_enhed_count", { ascending: false })
        .limit(1000);

      if (error) {
        toast.error("Kunne ikke hente data: " + error.message);
        setLoading(false);
        return;
      }

      const raw = (data ?? []) as any[];
      if (raw.length === 0) {
        toast.warning(
          "Ingen virksomheder er beriget med CVR-data endnu. Kør en Visma-import for at hente antal P-enheder fra CVR.",
          { duration: 8000 },
        );
      }

      const mapped: MersalgRow[] = raw
        .map((c) => {
          const ourLocations = Array.isArray(c.locations) ? c.locations[0]?.count ?? 0 : 0;
          const cvrLocations = c.cvr_p_enhed_count ?? 0;
          return {
            id: c.id,
            name: c.name,
            city: c.city,
            cvr: c.cvr,
            ourLocations,
            cvrLocations,
            potential: cvrLocations - ourLocations,
            assigned_to: c.assigned_to,
          };
        })
        .filter((c) => c.potential > 0)
        .sort((a, b) => b.potential - a.potential);

      setRows(mapped);
      setDidAnalyze(true);
      if (raw.length > 0) {
        toast.success(`Fandt ${mapped.length} virksomheder med flere afdelinger ifølge CVR.`);
      }
    } catch (e: any) {
      toast.error("Fejl ved analyse: " + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (r.potential < minPot) return false;
        if (seller !== "__all") {
          if (seller === "__none" && r.assigned_to) return false;
          if (seller !== "__none" && r.assigned_to !== seller) return false;
        }
        return true;
      }),
    [rows, seller, minPot],
  );

  function exportCsv() {
    downloadCsv(
      "horisontal-mersalg",
      ["Navn", "CVR", "By", "Sælger", "Vores lokationer", "CVR P-enheder", "Potentiale"],
      filtered.map((r) => [
        r.name,
        r.cvr ?? "",
        r.city ?? "",
        r.assigned_to ? profileMap.get(r.assigned_to) ?? "" : "",
        r.ourLocations,
        r.cvrLocations,
        r.potential,
      ]),
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-muted/30">
        <p className="text-sm">
          Find private kunder med ubearbejdede lokationer ifølge CVR-registret.
          Kommuner og institutioner er udeladt.
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <Label className="text-xs mb-1.5 block">Sælger</Label>
            <Select value={seller} onValueChange={setSeller}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Alle sælgere</SelectItem>
                <SelectItem value="__none">Ikke tildelt</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-[160px]">
            <Label className="text-xs mb-1.5 block">Min. potentiale</Label>
            <Select value={String(minPot)} onValueChange={(v) => setMinPot(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 3, 5, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}+</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={analyse} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <TrendingUp className="h-4 w-4 mr-1.5" />}
            Analysér
          </Button>
        </div>
      </Card>

      {didAnalyze && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">
              {filtered.length} virksomheder med potentiale
            </p>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download className="h-4 w-4 mr-1.5" /> Eksportér CSV
            </Button>
          </div>

          <Card>
            {filtered.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">
                Ingen virksomheder matcher.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5">Virksomhed</th>
                      <th className="text-left px-4 py-2.5">By</th>
                      <th className="text-right px-4 py-2.5">Vores</th>
                      <th className="text-right px-4 py-2.5">CVR</th>
                      <th className="text-right px-4 py-2.5">Potentiale</th>
                      <th className="text-left px-4 py-2.5">Sælger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <Link
                            to="/virksomheder/$id"
                            params={{ id: r.id }}
                            hash="lokationer"
                            className="font-medium hover:text-primary hover:underline"
                          >
                            {r.name}
                          </Link>
                          {r.cvr && (
                            <div className="text-xs text-muted-foreground">CVR {r.cvr}</div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.city ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">{r.ourLocations}</td>
                        <td className="px-4 py-2.5 text-right">{r.cvrLocations}</td>
                        <td className="px-4 py-2.5 text-right font-medium">
                          +{r.potential} {r.potential >= 3 ? "🔥" : ""}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {r.assigned_to ? profileMap.get(r.assigned_to) ?? "Ukendt" : (
                            <span className="italic">Ikke tildelt</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------- TAB 2: Tvillinger ---------- */

type RefCompany = {
  id: string;
  name: string;
  cvr: string | null;
  city: string | null;
  employees: number | null;
  main_branch_code: string | null;
  main_branch_text: string | null;
  municipality: string | null;
};

type TwinResult = {
  cvr: string;
  name: string;
  city: string | null;
  employees: number | null;
  main_branch_code: string | null;
  main_branch_text: string | null;
  municipality: string | null;
  source: "intern-kunde" | "intern-ikke-kunde" | "cvr";
};

function Tvillinger() {
  const cvrSearch = useServerFn(cvrSearchTwins);
  const [hasAnyEnriched, setHasAnyEnriched] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<RefCompany[]>([]);
  const [ref, setRef] = useState<RefCompany | null>(null);

  const [usePrefix, setUsePrefix] = useState(true);
  const [includeBi, setIncludeBi] = useState(false);
  const [useMin, setUseMin] = useState(true);
  const [useMax, setUseMax] = useState(true);
  const [useMunicipality, setUseMunicipality] = useState(false);
  const [minEmp, setMinEmp] = useState<number>(0);
  const [maxEmp, setMaxEmp] = useState<number>(0);
  const [prefix, setPrefix] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TwinResult[]>([]);
  const [didSearch, setDidSearch] = useState(false);

  useEffect(() => {
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .not("main_branch_code", "is", null)
      .then(({ count }) => setHasAnyEnriched((count ?? 0) > 0));
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, cvr, city, employees, main_branch_code, main_branch_text, municipality")
        .contains("sources", ["visma"])
        .not("main_branch_code", "is", null)
        .ilike("name", `%${q}%`)
        .limit(10);
      if (!cancelled) setOptions((data ?? []) as RefCompany[]);
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  function selectRef(c: RefCompany) {
    setRef(c);
    setSearch(c.name);
    setOptions([]);
    const p = (c.main_branch_code ?? "").slice(0, 2);
    setPrefix(p);
    const emp = c.employees ?? 0;
    setMinEmp(Math.max(1, Math.floor(emp * 0.5)));
    setMaxEmp(Math.max(emp * 2, emp + 5));
  }

  async function findTwins() {
    if (!ref) return;
    setLoading(true);
    setDidSearch(true);

    const min = useMin ? minEmp : undefined;
    const max = useMax ? maxEmp : undefined;
    const pfx = usePrefix ? prefix : "";

    // Source A: internal database
    let query = supabase
      .from("companies")
      .select("id, name, cvr, city, employees, main_branch_code, main_branch_text, municipality, sources")
      .not("id", "eq", ref.id)
      .limit(100);
    if (pfx) {
      if (includeBi) {
        query = query.or(
          [
            `main_branch_code.like.${pfx}%`,
            `bi_branch_1_code.like.${pfx}%`,
            `bi_branch_2_code.like.${pfx}%`,
            `bi_branch_3_code.like.${pfx}%`,
          ].join(","),
        );
      } else {
        query = query.like("main_branch_code", `${pfx}%`);
      }
    }
    if (min != null) query = query.gte("employees", min);
    if (max != null) query = query.lte("employees", max);
    if (useMunicipality && ref.municipality) query = query.eq("municipality", ref.municipality);

    const { data: internal } = await query;

    const intern: TwinResult[] = ((internal ?? []) as any[]).map((c) => ({
      cvr: c.cvr ?? "",
      name: c.name,
      city: c.city,
      employees: c.employees,
      main_branch_code: c.main_branch_code,
      main_branch_text: c.main_branch_text,
      municipality: c.municipality,
      source: Array.isArray(c.sources) && c.sources.includes("visma")
        ? "intern-kunde"
        : "intern-ikke-kunde",
    }));

    // Source B: CVR
    let cvrResults: TwinResult[] = [];
    if (pfx) {
      try {
        const excludeCvr = [
          ...(ref.cvr ? [ref.cvr] : []),
          ...intern.map((i) => i.cvr).filter((c): c is string => /^\d{8}$/.test(c)),
        ];
        const res = await cvrSearch({
          data: {
            branch_prefix: pfx,
            min_employees: min,
            max_employees: max,
            municipality: useMunicipality && ref.municipality ? ref.municipality : undefined,
            exclude_cvr: excludeCvr.slice(0, 500),
            size: 50,
          },
        });
        if (res.success && Array.isArray(res.data)) {
          cvrResults = res.data.map((c) => ({
            cvr: c.cvr,
            name: c.name ?? "(uden navn)",
            city: c.city,
            employees: null,
            main_branch_code: c.main_branch_code,
            main_branch_text: c.main_branch_text,
            municipality: c.municipality,
            source: "cvr",
          }));
        }
      } catch (e) {
        console.error("CVR twins fejl:", e);
      }
    }

    // Dedup by CVR (prefer internal)
    const seen = new Set<string>();
    const combined: TwinResult[] = [];
    for (const r of [...intern, ...cvrResults]) {
      const key = r.cvr || `name:${r.name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(r);
    }

    // Sort by closeness to ref employees
    const refEmp = ref.employees ?? 0;
    combined.sort((a, b) => {
      const da = a.employees == null ? 9999 : Math.abs((a.employees ?? 0) - refEmp);
      const db = b.employees == null ? 9999 : Math.abs((b.employees ?? 0) - refEmp);
      return da - db;
    });

    setResults(combined);
    setLoading(false);
  }

  function exportCsv() {
    downloadCsv(
      "tvillinger",
      ["Navn", "CVR", "By", "Ansatte", "Branchekode", "Branchetekst", "Kilde"],
      results.map((r) => [
        r.name,
        r.cvr,
        r.city ?? "",
        r.employees ?? "",
        r.main_branch_code ?? "",
        r.main_branch_text ?? "",
        r.source === "intern-kunde" ? "Aktiv kunde" : r.source === "intern-ikke-kunde" ? "Ikke kunde" : "Fra CVR",
      ]),
    );
  }

  if (hasAnyEnriched === false) {
    return (
      <Card className="p-6 flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border-amber-300">
        <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">CVR-data mangler</p>
          <p className="text-sm text-muted-foreground mt-1">
            Kør en Visma-import for at berige virksomhederne med branchekoder og ansatte-tal.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <Label className="text-xs mb-1.5 block">Vælg reference-virksomhed</Label>
        <div className="relative">
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setRef(null); }}
            placeholder="Søg på navn..."
          />
          {options.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md max-h-72 overflow-auto">
              {options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => selectRef(o)}
                  className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b border-border last:border-0"
                >
                  <div className="font-medium">{o.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {o.city ?? ""} · {o.main_branch_code} · {o.employees ?? "?"} ansatte
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {ref && (
          <div className="mt-3 p-3 rounded-md bg-muted/40 text-sm">
            <div className="font-medium">{ref.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {ref.main_branch_code} · {ref.main_branch_text} · {ref.employees ?? "?"} ansatte · {ref.municipality ?? "—"}
            </div>
          </div>
        )}
      </Card>

      {ref && (
        <Card className="p-4 space-y-3">
          <div className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
            Søgeparametre
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" checked={usePrefix} onChange={(e) => setUsePrefix(e.target.checked)} />
            <Label className="flex-1">Hoved-branche prefix</Label>
            <Input className="w-24" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" checked={includeBi} onChange={(e) => setIncludeBi(e.target.checked)} />
            <Label>Inkluder bibranche-matches (kun internt)</Label>
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" checked={useMin} onChange={(e) => setUseMin(e.target.checked)} />
            <Label className="flex-1">Min. ansatte</Label>
            <Input
              type="number"
              className="w-24"
              value={minEmp}
              onChange={(e) => setMinEmp(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" checked={useMax} onChange={(e) => setUseMax(e.target.checked)} />
            <Label className="flex-1">Max. ansatte</Label>
            <Input
              type="number"
              className="w-24"
              value={maxEmp}
              onChange={(e) => setMaxEmp(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-3">
            <input type="checkbox" checked={useMunicipality} onChange={(e) => setUseMunicipality(e.target.checked)} />
            <Label>Samme kommune ({ref.municipality ?? "—"})</Label>
          </div>

          <Button onClick={findTwins} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Search className="h-4 w-4 mr-1.5" />}
            Find tvillinger
          </Button>
        </Card>
      )}

      {didSearch && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-muted-foreground">{results.length} tvillinger fundet</p>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!results.length}>
              <Download className="h-4 w-4 mr-1.5" /> Eksportér CSV
            </Button>
          </div>
          <Card>
            {results.length === 0 ? (
              <div className="p-8 text-sm text-muted-foreground text-center">Ingen tvillinger fundet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2.5">Virksomhed</th>
                      <th className="text-left px-4 py-2.5">By</th>
                      <th className="text-right px-4 py-2.5">Ansatte</th>
                      <th className="text-left px-4 py-2.5">Branche</th>
                      <th className="text-left px-4 py-2.5">Kilde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={`${r.cvr}-${i}`} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{r.name}</div>
                          {r.cvr && <div className="text-xs text-muted-foreground">CVR {r.cvr}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.city ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          {r.employees ?? <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          <span className="font-mono text-xs">{r.main_branch_code}</span>{" "}
                          {r.main_branch_text}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.source === "intern-kunde" && (
                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Aktiv kunde</Badge>
                          )}
                          {r.source === "intern-ikke-kunde" && (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Ikke kunde</Badge>
                          )}
                          {r.source === "cvr" && (
                            <Badge variant="secondary">Fra CVR</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ---------- TAB 3 + 4: Sovende / Tidligere kunder ---------- */

type DormantRow = {
  id: string;
  name: string;
  city: string | null;
  cvr: string | null;
  phone: string | null;
  last_purchase_date: string | null;
  main_branch_text: string | null;
  employees: number | null;
  assigned_to: string | null;
};

function DormantTable({
  cutoffDays,
  title,
  csvName,
}: {
  cutoffDays: number;
  title: string;
  csvName: string;
}) {
  const { map: profileMap } = useProfiles();
  const [rows, setRows] = useState<DormantRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];
      const { data, error } = await supabase
        .from("companies")
        .select(
          "id, name, city, cvr, phone, last_purchase_date, main_branch_text, employees, assigned_to",
        )
        .contains("sources", ["visma"])
        .not("last_purchase_date", "is", null)
        .lt("last_purchase_date", cutoff)
        .order("last_purchase_date", { ascending: true })
        .limit(500);
      if (error) toast.error(error.message);
      setRows((data ?? []) as DormantRow[]);
      setLoading(false);
    })();
  }, [cutoffDays]);

  function exportCsv() {
    downloadCsv(
      csvName,
      ["Navn", "CVR", "By", "Seneste varekøb", "Sælger", "Branche"],
      rows.map((r) => [
        r.name,
        r.cvr ?? "",
        r.city ?? "",
        r.last_purchase_date ?? "",
        r.assigned_to ? profileMap.get(r.assigned_to) ?? "" : "",
        r.main_branch_text ?? "",
      ]),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          {loading ? "Indlæser…" : `${rows.length} ${title.toLowerCase()}`}
        </p>
        <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download className="h-4 w-4 mr-1.5" /> Eksportér CSV
        </Button>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">Ingen virksomheder fundet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2.5">Virksomhed</th>
                  <th className="text-left px-4 py-2.5">By</th>
                  <th className="text-left px-4 py-2.5">Seneste køb</th>
                  <th className="text-left px-4 py-2.5">Branche</th>
                  <th className="text-left px-4 py-2.5">Sælger</th>
                  <th className="text-right px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <Link
                        to="/virksomheder/$id"
                        params={{ id: r.id }}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.cvr && <div className="text-xs text-muted-foreground">CVR {r.cvr}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.city ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.last_purchase_date ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.main_branch_text ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {r.assigned_to ? profileMap.get(r.assigned_to) ?? "Ukendt" : (
                        <span className="italic">Ikke tildelt</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {r.phone ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={`tel:${r.phone.replace(/\s+/g, "")}`}>
                            <Phone className="h-3.5 w-3.5 mr-1.5" /> Ring nu
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Intet tlf.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function SovendeKunder() {
  return (
    <DormantTable
      cutoffDays={365}
      title="sovende kunder (12+ mdr)"
      csvName="sovende-kunder"
    />
  );
}

function TidligereKunder() {
  return (
    <DormantTable
      cutoffDays={730}
      title="tidligere kunder (24+ mdr)"
      csvName="tidligere-kunder"
    />
  );
}
