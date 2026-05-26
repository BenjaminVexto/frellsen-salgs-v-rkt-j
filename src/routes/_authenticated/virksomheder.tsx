import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CustomerStatusBadge } from "@/components/customer-status-info";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  X,
  Filter as FilterIcon,
  ChevronDown,
  Save,
  Trash2,
  Loader2,
  Search,
} from "lucide-react";
import { SourceBadges } from "@/components/source-badges";
import { OpretVirksomhedDialog } from "@/components/opret-virksomhed-dialog";
import { AssignToListDialog } from "@/components/assign-to-list-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/virksomheder")({
  component: VirksomhederListe,
});

type Row = {
  id: string;
  name: string;
  cvr: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  municipality: string | null;
  customer_type: string;
  sources: string[] | null;
  customer_segment_2: string | null;
  last_purchase_date: string | null;
  employees: number | null;
  is_public: boolean | null;
};

type Assignment = { company_id: string; assigned_to: string | null };

type FilterState = {
  customerTypes: string[];
  sources: string[];
  assignment: "all" | "unassigned" | "assigned" | "specific";
  assignedToUserId: string;
  machineStatus: string[];
  city: string;
  municipality: string;
  zipFrom: string;
  zipTo: string;
  lastPurchase: string[];
  employeeRanges: string[];
  sector: "all" | "private" | "public" | "unknown";
};

const DEFAULT_FILTERS: FilterState = {
  customerTypes: [],
  sources: [],
  assignment: "all",
  assignedToUserId: "",
  machineStatus: [],
  city: "",
  municipality: "",
  zipFrom: "",
  zipTo: "",
  lastPurchase: [],
  employeeRanges: [],
  sector: "all",
};

const customerTypeLabel: Record<string, string> = {
  nyt_emne: "Nyt emne",
  aktiv_kunde: "Aktiv kunde",
  sovende_kunde: "Sovende kunde",
  tidligere_kunde: "Tidligere kunde",
};

const RECENT_KEY = "recently_imported_ids";
const PAGE_SIZE = 50;

const firstFilled = (...values: Array<string | null | undefined>) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

function VirksomhederListe() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [assignmentMap, setAssignmentMap] = useState<Map<string, string[]>>(
    new Map(),
  );
  const [locationMap, setLocationMap] = useState<Map<string, { city: string | null; address: string | null; zip: string | null }[]>>(
    new Map(),
  );
  const [recentIds, setRecentIds] = useState<string[] | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [assignOpen, setAssignOpen] = useState(false);
  const [templates, setTemplates] = useState<
    { id: string; name: string; filter_config: any }[]
  >([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);

  // Sælgere til "specifik sælger" filter
  const [sellers, setSellers] = useState<
    { id: string; full_name: string }[]
  >([]);
  const [municipalities, setMunicipalities] = useState<string[]>([]);

  const isAdmin = auth.role === "admin";

  // Læs nyligt importerede fra sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECENT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { ids: string[]; at: number };
        if (
          parsed.at &&
          Date.now() - parsed.at < 30 * 60 * 1000 &&
          Array.isArray(parsed.ids)
        ) {
          setRecentIds(parsed.ids);
        } else {
          sessionStorage.removeItem(RECENT_KEY);
        }
      }
    } catch {}
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    const cols =
      "id,name,cvr,address,city,zip,municipality,customer_type,sources,customer_segment_2,last_purchase_date,employees,is_public,assigned_to";
    if (recentIds && recentIds.length) {
      const { data } = await supabase
        .from("companies")
        .select(cols)
        .in("id", recentIds)
        .order("name");
      setRows((data ?? []) as any);
      setLoading(false);
      return;
    }
    // Paginér forbi Supabase' 1000-rækkers grænse pr. request
    const PAGE = 1000;
    const all: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("companies")
        .select(cols)
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) break;
      const batch = data ?? [];
      all.push(...batch);
      if (batch.length < PAGE) break;
    }
    setRows(all as any);
    setLoading(false);
  };

  useEffect(() => {
    loadCompanies();
  }, [recentIds]);

  // Tildelinger (alle) — gemmes som map company_id -> assigned_to[]
  // Kombinerer direkte companies.assigned_to (Visma-auto-tildeling) med contact_list_assignments.
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data } = await supabase
        .from("contact_list_assignments")
        .select("company_id, assigned_to")
        .limit(10000);
      const m = new Map<string, string[]>();
      // Direkte sælger på virksomheden (fra Visma-import)
      for (const r of rows as any[]) {
        if (r.assigned_to) m.set(r.id, [r.assigned_to]);
      }
      // Tildelinger via kontaktlister (kan tilføje flere sælgere)
      (data ?? []).forEach((a: Assignment) => {
        const arr = m.get(a.company_id) ?? [];
        if (a.assigned_to && !arr.includes(a.assigned_to)) arr.push(a.assigned_to);
        m.set(a.company_id, arr);
      });
      setAssignmentMap(m);
    })();
  }, [isAdmin, rows]);

  // Lokationer for alle virksomheder — bruges til fritekstsøgning
  useEffect(() => {
    if (!rows.length) return;
    (async () => {
      const ids = rows.map((r) => r.id);
      const m = new Map<string, { city: string | null; address: string | null; zip: string | null }[]>();
      for (let i = 0; i < ids.length; i += 500) {
        const slice = ids.slice(i, i + 500);
        const { data } = await (supabase as any)
          .from("locations")
          .select("company_id, city, address, zip")
          .in("company_id", slice);
        (data ?? []).forEach((l: any) => {
          const arr = m.get(l.company_id) ?? [];
          arr.push({ city: l.city, address: l.address, zip: l.zip });
          m.set(l.company_id, arr);
        });
      }
      setLocationMap(m);
    })();
  }, [rows]);

  // Sælgere
  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "saelger");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids)
        .eq("is_active", true);
      setSellers(profs ?? []);
    })();
  }, [isAdmin]);

  // Unique kommuner
  useEffect(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (r.municipality) set.add(r.municipality);
    });
    setMunicipalities(Array.from(set).sort());
  }, [rows]);

  // Filter templates
  const loadTemplates = async () => {
    if (!isAdmin) return;
    const { data } = await (supabase as any)
      .from("filter_templates")
      .select("id, name, filter_config")
      .order("created_at", { ascending: false });
    setTemplates(data ?? []);
  };
  useEffect(() => {
    loadTemplates();
  }, [isAdmin]);

  const matchesMachineStatus = (val: string | null, modes: string[]) => {
    if (!modes.length) return true;
    const v = (val ?? "").toLowerCase();
    const hasLeased = /udlån|leje/.test(v);
    const isEmpty = !v.trim();
    return modes.some((m) => {
      if (m === "leased") return hasLeased;
      if (m === "none") return isEmpty;
      if (m === "unknown") return !isEmpty && !hasLeased;
      return false;
    });
  };

  const matchesLastPurchase = (date: string | null, modes: string[]) => {
    if (!modes.length) return true;
    if (!date) return modes.includes("never");
    const d = new Date(date);
    const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    return modes.some((m) => {
      switch (m) {
        case "never":
          return false;
        case "0-3":
          return months < 3;
        case "3-6":
          return months >= 3 && months < 6;
        case "6-12":
          return months >= 6 && months < 12;
        case "12-18":
          return months >= 12 && months < 18;
        case "18+":
          return months >= 18;
        default:
          return false;
      }
    });
  };

  const matchesEmployees = (n: number | null, ranges: string[]) => {
    if (!ranges.length) return true;
    return ranges.some((r) => {
      if (r === "unknown") return n == null;
      if (n == null) return false;
      if (r === "lt10") return n < 10;
      if (r === "10-49") return n >= 10 && n <= 49;
      if (r === "50-199") return n >= 50 && n <= 199;
      if (r === "200+") return n >= 200;
      return false;
    });
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      // søgetekst
      if (q) {
        const rawQuery = q.trim();
        if (!rawQuery) return true;
        const qq = rawQuery.toLowerCase();
        const locs = locationMap.get(r.id) ?? [];
        const hit =
          r.name.toLowerCase().includes(qq) ||
          (r.cvr ?? "").includes(rawQuery) ||
          (r.address ?? "").toLowerCase().includes(qq) ||
          (r.city ?? "").toLowerCase().includes(qq) ||
          (r.zip ?? "").includes(rawQuery) ||
          locs.some(
            (l) =>
              (l.city ?? "").toLowerCase().includes(qq) ||
              (l.address ?? "").toLowerCase().includes(qq) ||
              (l.zip ?? "").includes(rawQuery),
          );
        if (!hit) return false;
      }
      if (
        filters.customerTypes.length &&
        !filters.customerTypes.includes(r.customer_type)
      )
        return false;
      if (filters.sources.length) {
        const src = r.sources ?? [];
        if (!filters.sources.some((s) => src.includes(s))) return false;
      }
      if (filters.assignment !== "all") {
        const assigns = assignmentMap.get(r.id) ?? [];
        if (filters.assignment === "unassigned" && assigns.length > 0)
          return false;
        if (filters.assignment === "assigned" && assigns.length === 0)
          return false;
        if (
          filters.assignment === "specific" &&
          (!filters.assignedToUserId ||
            !assigns.includes(filters.assignedToUserId))
        )
          return false;
      }
      if (!matchesMachineStatus(r.customer_segment_2, filters.machineStatus))
        return false;
      if (filters.city && !(r.city ?? "").toLowerCase().includes(filters.city.toLowerCase()))
        return false;
      if (filters.municipality && r.municipality !== filters.municipality)
        return false;
      if (filters.zipFrom || filters.zipTo) {
        const z = parseInt(r.zip ?? "");
        if (Number.isNaN(z)) return false;
        if (filters.zipFrom && z < parseInt(filters.zipFrom)) return false;
        if (filters.zipTo && z > parseInt(filters.zipTo)) return false;
      }
      if (!matchesLastPurchase(r.last_purchase_date, filters.lastPurchase))
        return false;
      if (!matchesEmployees(r.employees, filters.employeeRanges)) return false;
      if (filters.sector !== "all") {
        const pub = r.is_public === true;
        const hasCvr = !!r.cvr;
        if (filters.sector === "public" && !pub) return false;
        if (filters.sector === "private" && (pub || !hasCvr)) return false;
        if (filters.sector === "unknown" && (pub || hasCvr)) return false;
      }
      return true;
    });
  }, [rows, q, filters, assignmentMap, locationMap]);

  // Reset til side 0 når filtre ændrer sig
  useEffect(() => {
    setPage(0);
  }, [filters, q, recentIds]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const clearRecent = () => {
    sessionStorage.removeItem(RECENT_KEY);
    setRecentIds(null);
  };

  const isFilterActive = useMemo(() => {
    return (
      filters.customerTypes.length > 0 ||
      filters.sources.length > 0 ||
      filters.assignment !== "all" ||
      filters.machineStatus.length > 0 ||
      filters.city.trim() !== "" ||
      filters.municipality !== "" ||
      filters.zipFrom !== "" ||
      filters.zipTo !== "" ||
      filters.lastPurchase.length > 0 ||
      filters.employeeRanges.length > 0 ||
      filters.sector !== "all"
    );
  }, [filters]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = (check: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      pageRows.forEach((r) => (check ? next.add(r.id) : next.delete(r.id)));
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map((r) => r.id)));
  };

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));

  const selectedCompanies = useMemo(
    () =>
      rows
        .filter((r) => selected.has(r.id))
        .map((r) => ({ id: r.id, municipality: r.municipality })),
    [rows, selected],
  );

  const applyTemplate = (tplId: string) => {
    const t = templates.find((x) => x.id === tplId);
    if (!t) return;
    setFilters({ ...DEFAULT_FILTERS, ...(t.filter_config ?? {}) });
    setFiltersOpen(true);
    toast.success(`Skabelon "${t.name}" indlæst`);
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await (supabase as any)
      .from("filter_templates")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Skabelon slettet");
      loadTemplates();
    }
  };

  return (
    <div className="px-4 md:px-8 py-8 max-w-7xl mx-auto pb-32 md:pb-32">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Virksomheder</h1>
        <OpretVirksomhedDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Opret virksomhed
            </Button>
          }
        />
      </div>

      {recentIds && recentIds.length > 0 && (
        <Card className="p-3 mb-4 flex items-center justify-between bg-primary/5 border-primary/30">
          <div className="text-sm">
            Viser <strong>{recentIds.length}</strong> nyligt importerede
            virksomheder.
          </div>
          <Button size="sm" variant="ghost" onClick={clearRecent}>
            <X className="h-4 w-4 mr-1" /> Ryd filter
          </Button>
        </Card>
      )}

      {/* Søg + filter toggle */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <Input
          placeholder="Søg på navn, adresse, postnr., by, CVR eller lokation…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
        {isAdmin && (
          <Button
            variant={filtersOpen || isFilterActive ? "default" : "outline"}
            size="sm"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <FilterIcon className="h-4 w-4 mr-1" />
            Filtre
            {isFilterActive && (
              <Badge variant="secondary" className="ml-2">
                Aktiv
              </Badge>
            )}
            <ChevronDown
              className={`h-4 w-4 ml-1 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
            />
          </Button>
        )}
        {isAdmin && isFilterActive && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              <X className="h-4 w-4 mr-1" /> Nulstil filtre
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSaveTemplateOpen(true)}
            >
              <Save className="h-4 w-4 mr-1" /> Gem filter som skabelon
            </Button>
          </>
        )}
      </div>

      {/* Filter panel */}
      {isAdmin && (
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleContent>
            <Card className="p-4 mb-3 space-y-4">
              {templates.length > 0 && (
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    Skabeloner
                  </Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {templates.map((t) => (
                      <div
                        key={t.id}
                        className="inline-flex items-center gap-1 border rounded-md px-2 py-1 text-sm bg-muted/30"
                      >
                        <button
                          className="hover:underline"
                          onClick={() => applyTemplate(t.id)}
                        >
                          {t.name}
                        </button>
                        <button
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => deleteTemplate(t.id)}
                          title="Slet skabelon"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <FilterGroup
                  label="Kundestatus"
                  options={[
                    { v: "aktiv_kunde", l: "Aktiv kunde" },
                    { v: "sovende_kunde", l: "Sovende kunde" },
                    { v: "tidligere_kunde", l: "Tidligere kunde" },
                    { v: "nyt_emne", l: "Nyt emne" },
                  ]}
                  values={filters.customerTypes}
                  onChange={(v) =>
                    setFilters((f) => ({ ...f, customerTypes: v }))
                  }
                />
                <FilterGroup
                  label="Kilde"
                  options={[
                    { v: "visma", l: "Visma-kunde" },
                    { v: "cvr", l: "CVR-beriget" },
                    { v: "manuel", l: "Manuelt oprettet" },
                  ]}
                  values={filters.sources}
                  onChange={(v) => setFilters((f) => ({ ...f, sources: v }))}
                />
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    Tildeling
                  </Label>
                  <Select
                    value={filters.assignment}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        assignment: v as FilterState["assignment"],
                      }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="unassigned">Ikke tildelt</SelectItem>
                      <SelectItem value="assigned">Tildelt</SelectItem>
                      <SelectItem value="specific">
                        Tildelt til specifik sælger
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {filters.assignment === "specific" && (
                    <Select
                      value={filters.assignedToUserId}
                      onValueChange={(v) =>
                        setFilters((f) => ({ ...f, assignedToUserId: v }))
                      }
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Vælg sælger…" />
                      </SelectTrigger>
                      <SelectContent>
                        {sellers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.full_name || "Uden navn"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <FilterGroup
                  label="Maskinstatus (segment 2)"
                  options={[
                    { v: "none", l: "Har IKKE maskine" },
                    { v: "leased", l: "Har udlån/leje" },
                    { v: "unknown", l: "Ukendt" },
                  ]}
                  values={filters.machineStatus}
                  onChange={(v) =>
                    setFilters((f) => ({ ...f, machineStatus: v }))
                  }
                />
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">
                    Geografi
                  </Label>
                  <Input
                    className="mt-1"
                    placeholder="By…"
                    value={filters.city}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, city: e.target.value }))
                    }
                  />
                  <Select
                    value={filters.municipality || "__all"}
                    onValueChange={(v) =>
                      setFilters((f) => ({
                        ...f,
                        municipality: v === "__all" ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue placeholder="Alle kommuner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">Alle kommuner</SelectItem>
                      {municipalities.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input
                      placeholder="Postnr fra"
                      value={filters.zipFrom}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, zipFrom: e.target.value }))
                      }
                    />
                    <Input
                      placeholder="Postnr til"
                      value={filters.zipTo}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, zipTo: e.target.value }))
                      }
                    />
                  </div>
                </div>
                <FilterGroup
                  label="Seneste varekøb"
                  options={[
                    { v: "never", l: "Aldrig købt" },
                    { v: "0-3", l: "Inden for 3 måneder" },
                    { v: "3-6", l: "3–6 måneder siden" },
                    { v: "6-12", l: "6–12 måneder siden" },
                    { v: "12-18", l: "12–18 måneder siden" },
                    { v: "18+", l: "Over 18 måneder siden" },
                  ]}
                  values={filters.lastPurchase}
                  onChange={(v) =>
                    setFilters((f) => ({ ...f, lastPurchase: v }))
                  }
                />
                <FilterGroup
                  label="Antal ansatte"
                  options={[
                    { v: "lt10", l: "Under 10" },
                    { v: "10-49", l: "10–49" },
                    { v: "50-199", l: "50–199" },
                    { v: "200+", l: "200+" },
                    { v: "unknown", l: "Ukendt" },
                  ]}
                  values={filters.employeeRanges}
                  onChange={(v) =>
                    setFilters((f) => ({ ...f, employeeRanges: v }))
                  }
                />
                <div>
                  <Label className="text-xs uppercase text-muted-foreground">Sektor</Label>
                  <Select
                    value={filters.sector}
                    onValueChange={(v) =>
                      setFilters((f) => ({ ...f, sector: v as FilterState["sector"] }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alle</SelectItem>
                      <SelectItem value="private">Private virksomheder</SelectItem>
                      <SelectItem value="public">Offentlige institutioner</SelectItem>
                      <SelectItem value="unknown">Ukendt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Resultat-tæller */}
      <div className="text-sm text-muted-foreground mb-2">
        <strong className="text-foreground">{filtered.length}</strong>{" "}
        virksomheder matcher
        {filtered.length > 0 && (
          <>
            {" "}
            · Side {page + 1} af {totalPages}
          </>
        )}
      </div>

      <Card className="divide-y">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Indlæser…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Ingen virksomheder fundet.
          </p>
        ) : (
          <>
            {isAdmin && (
              <div className="flex items-center justify-between gap-3 px-4 py-2 bg-muted/30 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={(v) => selectAllOnPage(!!v)}
                  />
                  Vælg alle på denne side ({pageRows.length})
                </label>
                {selected.size < filtered.length && (
                  <button
                    className="text-primary hover:underline text-xs"
                    onClick={selectAllFiltered}
                  >
                    Vælg alle {filtered.length} resultater der matcher filteret
                  </button>
                )}
              </div>
            )}
            {pageRows.map((r) => {
              const assigns = assignmentMap.get(r.id) ?? [];
              const unassigned = isAdmin && assigns.length === 0;
              const checked = selected.has(r.id);
              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors ${checked ? "bg-primary/5" : ""}`}
                >
                  {isAdmin && (
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSelect(r.id)}
                    />
                  )}
                  <Link
                    to="/virksomheder/$id"
                    params={{ id: r.id }}
                    className="flex items-center justify-between flex-1 min-w-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{r.name}</span>
                        <SourceBadges sources={r.sources} size="sm" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        CVR {r.cvr ?? "—"}
                        {r.city ? ` · ${r.city}` : ""}
                        {r.municipality ? ` · ${r.municipality}` : ""}
                      </div>
                      {(() => {
                        if (!q) return null;
                        const rawQuery = q.trim();
                        if (!rawQuery) return null;
                        const qq = rawQuery.toLowerCase();
                        const nameHit = r.name.toLowerCase().includes(qq);
                        const cvrHit = (r.cvr ?? "").includes(rawQuery);
                        const addrHit = (r.address ?? "").toLowerCase().includes(qq);
                        const cityHit = (r.city ?? "").toLowerCase().includes(qq);
                        const zipHit = (r.zip ?? "").includes(rawQuery);
                        if (nameHit || cvrHit || addrHit || cityHit || zipHit) return null;
                        const locs = locationMap.get(r.id) ?? [];
                        const match = locs.find(
                          (l) =>
                            (l.city ?? "").toLowerCase().includes(qq) ||
                            (l.address ?? "").toLowerCase().includes(qq) ||
                            (l.zip ?? "").includes(rawQuery),
                        );
                        if (!match) return null;
                        const parts = [
                          firstFilled(match.address),
                          [firstFilled(match.zip), firstFilled(match.city)].filter(Boolean).join(" "),
                        ]
                          .filter((p) => p && p.trim())
                          .join(", ");
                        return (
                          <div className="text-xs text-primary mt-0.5">
                            📍 Match: {parts || "lokation"}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {unassigned && (
                        <Badge
                          variant="outline"
                          className="border-warning/40 text-warning"
                        >
                          Ikke tildelt
                        </Badge>
                      )}
                       {r.is_public && (
                         <Badge variant="outline" className="border-primary/40 text-primary bg-primary/5">
                           Offentlig
                         </Badge>
                       )}
                       <CustomerStatusBadge type={r.customer_type} />

                    </div>
                  </Link>
                </div>
              );
            })}
          </>
        )}
      </Card>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Forrige
          </Button>
          <span className="text-muted-foreground">
            Side {page + 1} af {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Næste
          </Button>
        </div>
      )}

      {/* Sticky bulk action bar */}
      {isAdmin && selected.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border shadow-lg rounded-full px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium">
            {selected.size} virksomheder valgt
          </span>
          <div className="h-5 w-px bg-border" />
          <Button size="sm" onClick={() => setAssignOpen(true)}>
            Tildel til kontaktliste
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReassignOpen(true)}
          >
            Skift ansvarlig sælger
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            <X className="h-4 w-4 mr-1" />
            Fjern markering
          </Button>
        </div>
      )}

      <AssignToListDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        companies={selectedCompanies}
        onAssigned={async () => {
          setSelected(new Set());
          // Refresh assignment map
          const { data } = await supabase
            .from("contact_list_assignments")
            .select("company_id, assigned_to")
            .limit(10000);
          const m = new Map<string, string[]>();
          (data ?? []).forEach((a: Assignment) => {
            const arr = m.get(a.company_id) ?? [];
            if (a.assigned_to) arr.push(a.assigned_to);
            m.set(a.company_id, arr);
          });
          setAssignmentMap(m);
        }}
      />

      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        filters={filters}
        onSaved={() => loadTemplates()}
      />

      <ReassignSellerDialog
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        companyIds={Array.from(selected)}
        sellers={sellers}
        onDone={async () => {
          setSelected(new Set());
          setReassignOpen(false);
          const { data } = await supabase
            .from("contact_list_assignments")
            .select("company_id, assigned_to")
            .limit(10000);
          const m = new Map<string, string[]>();
          (data ?? []).forEach((a: Assignment) => {
            const arr = m.get(a.company_id) ?? [];
            if (a.assigned_to) arr.push(a.assigned_to);
            m.set(a.company_id, arr);
          });
          setAssignmentMap(m);
          toast.success("Ansvarlig sælger opdateret");
        }}
      />
    </div>
  );
}

// ---------- Filter group component ----------
function FilterGroup({
  label,
  options,
  values,
  onChange,
}: {
  label: string;
  options: { v: string; l: string }[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <div>
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      <div className="mt-1 space-y-1.5">
        {options.map((o) => (
          <label
            key={o.v}
            className="flex items-center gap-2 text-sm cursor-pointer"
          >
            <Checkbox
              checked={values.includes(o.v)}
              onCheckedChange={() => toggle(o.v)}
            />
            {o.l}
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------- Save template dialog ----------
function SaveTemplateDialog({
  open,
  onOpenChange,
  filters,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  filters: FilterState;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("Navn er påkrævet");
      return;
    }
    setSaving(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await (supabase as any).from("filter_templates").insert({
      name: name.trim(),
      created_by: userRes.user?.id,
      filter_config: filters,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Skabelon "${name}" gemt`);
    setName("");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gem filter som skabelon</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Navn</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fx: Sovende kunder Jylland uden maskine"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Gem skabelon
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Reassign seller dialog ----------
function ReassignSellerDialog({
  open,
  onOpenChange,
  companyIds,
  sellers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  companyIds: string[];
  sellers: { id: string; full_name: string }[];
  onDone: () => void;
}) {
  const [sellerId, setSellerId] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!sellerId) {
      toast.error("Vælg en sælger");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("contact_list_assignments")
      .update({ assigned_to: sellerId })
      .in("company_id", companyIds);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSellerId("");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Skift ansvarlig sælger for {companyIds.length} virksomheder
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Opdaterer alle eksisterende tildelinger på de valgte virksomheder.
          Virksomheder uden tildeling påvirkes ikke — brug "Tildel til
          kontaktliste" til dem.
        </p>
        <div className="space-y-2">
          <Label>Ny ansvarlig sælger</Label>
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger>
              <SelectValue placeholder="Vælg sælger…" />
            </SelectTrigger>
            <SelectContent>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.full_name || "Uden navn"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annullér
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Opdater
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
